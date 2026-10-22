import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Source producer only. This file never opens a connection or runs SQL.
const [migrationFile, configFile, outputDir] = process.argv.slice(2);
if (!migrationFile || !configFile || !outputDir) throw new Error('migration, reviewed config and output directory required');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const quote = text => "'" + text.replaceAll("'", "''") + "'";
const raw = await fs.readFile(migrationFile, 'utf8');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const version = '20261022220000';
const newTables = ['data_subject_request_deadline_events'];
const rpcSignatures = ['public.uc_dsr_create(uuid,uuid,text,text,text)','public.uc_dsr_list(uuid,uuid,jsonb,integer)','public.uc_dsr_apply(uuid,bigint,text,jsonb)'];
const oldBodies = {'public.set_dsr_due_date()':'a3fe0db2ed0244deb595e9ac76712d93','public.get_documents_kpi(uuid)':'7b1d582dbaea5a699b554aa0e90e98b0'};
if (path.basename(migrationFile) !== version+'_uc_personal_data_request_deadlines.sql' || /\r/.test(raw)) throw new Error('Canonical LF exact migration required');
if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(raw)) throw new Error('Outer transaction belongs to producer');
if (config.rawSHA256 !== sha(raw) || config.expectedLedger !== 618 || config.expectedPublicTables !== 338) throw new Error('Source or baseline mismatch');
if (JSON.stringify(config.newTables) !== JSON.stringify(newTables)) throw new Error('Exact one history table required');
if (!Array.isArray(config.newFunctions) || config.newFunctions.length!==8 || new Set(config.newFunctions).size !== config.newFunctions.length
  || config.newFunctions.some(s => !/^public\.uc_dsr_[a-z0-9_]+\([a-z0-9_, .\[\]]*\)$/.test(s))
  || rpcSignatures.some(s => !config.newFunctions.includes(s))) throw new Error('Explicit bounded new function signatures required');
if (JSON.stringify(Object.keys(config.newBodyMD5).sort()) !== JSON.stringify(Object.keys(oldBodies).sort())
  || Object.entries(config.newBodyMD5).some(([s,h]) => !/^[0-9a-f]{32}$/.test(h) || h === oldBodies[s])) throw new Error('Actual native new body digests required');
if (!Array.isArray(config.nativeParentFKTriggers) || config.nativeParentFKTriggers.length !== 4) throw new Error('Exact four actual native parent FK triggers required');
const bodyRows = Object.entries(oldBodies).map(([signature, old]) => `(${quote(signature)},${quote(old)},${quote(config.newBodyMD5[signature])})`).join(',\n');
const newFunctionRows = config.newFunctions.map(s => `(${quote(s)})`).join(',\n');
const newTableArray = 'ARRAY['+newTables.map(quote).join(',')+']';
const rpcArray = 'ARRAY['+rpcSignatures.map(s => `${quote(s)}::regprocedure::oid`).join(',')+']';

const prefix = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path=pg_catalog,public;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL standard_conforming_strings=on;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='5s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc023_body_allowlist(signature text PRIMARY KEY,old_md5 text NOT NULL,new_md5 text NOT NULL) ON COMMIT DROP;
INSERT INTO uc023_body_allowlist VALUES ${bodyRows};
CREATE TEMP TABLE uc023_new_function_allowlist(signature text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO uc023_new_function_allowlist VALUES ${newFunctionRows};

CREATE TEMP TABLE uc023_expected_catalog(value jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO uc023_expected_catalog VALUES (${quote(JSON.stringify(config))}::jsonb);
DO $pre$ BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>618
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p'))<>338
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${quote(version)})
 OR EXISTS(SELECT 1 FROM uc023_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.old_md5)
 OR EXISTS(SELECT 1 FROM uc023_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${newTableArray}))
 THEN RAISE EXCEPTION 'UC023_PRE619_BASELINE_MISMATCH';END IF;
 IF (SELECT to_jsonb(c)FROM pg_class c WHERE c.oid='public.data_subject_requests'::regclass)IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_class'FROM uc023_expected_catalog)
 OR(SELECT jsonb_agg(to_jsonb(a)ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid='public.data_subject_requests'::regclass)IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_attributes'FROM uc023_expected_catalog)
 OR(SELECT coalesce(jsonb_agg(to_jsonb(p)ORDER BY p.oid),'[]')FROM pg_policy p WHERE p.polrelid='public.data_subject_requests'::regclass)IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_policies'FROM uc023_expected_catalog)
 OR(SELECT jsonb_agg(to_jsonb(t)ORDER BY t.oid)FROM pg_trigger t WHERE t.tgrelid IN('public.data_subject_requests'::regclass,'auth.users'::regclass))IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_and_auth_triggers'FROM uc023_expected_catalog)
 THEN RAISE EXCEPTION 'UC023_EXACT_PRE_ACL_POLICY_PARENT_CATALOG_MISMATCH';END IF;

 IF(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid,true),'metadata',to_jsonb(c))ORDER BY c.conname)FROM pg_constraint c WHERE c.conrelid='public.data_subject_requests'::regclass)IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_constraints'FROM uc023_expected_catalog)
 OR(SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'definition',pg_get_expr(d.adbin,d.adrelid),'metadata',to_jsonb(d))ORDER BY d.adnum),'[]')FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='public.data_subject_requests'::regclass)IS DISTINCT FROM(SELECT value->'productionPreImage'->'old_dsr_defaults'FROM uc023_expected_catalog)
 THEN RAISE EXCEPTION 'UC023_EXACT_PRE_CONSTRAINT_DEFAULT_MISMATCH';END IF;
END $pre$;
-- Inventory predates all new application objects. Existing object bodies, ACL,
-- identities and definition tuples remain compared by exact existing OID.
CREATE TEMP TABLE uc023_old_classes ON COMMIT DROP AS SELECT c.oid,n.nspname,c.relname,c.relkind,to_jsonb(c) metadata,(SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)projection FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage');
CREATE TEMP TABLE uc023_old_attributes ON COMMIT DROP AS SELECT a.attrelid,a.attnum FROM pg_attribute a JOIN uc023_old_classes o ON o.oid=a.attrelid;
CREATE FUNCTION pg_temp.uc023_acl_keep(p_acl aclitem[],p_owner oid,p_column boolean)RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,public AS $acl$
 SELECT coalesce(jsonb_agg(jsonb_build_array(x.grantor,x.grantee,x.privilege_type,x.is_grantable)ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable),'[]')FROM aclexplode(NULLIF(CASE WHEN p_column THEN p_acl ELSE coalesce(p_acl,acldefault('r',p_owner))END,'{}'::aclitem[]))x WHERE x.grantee<>ALL(ARRAY[0::oid,(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated')]);
$acl$;
CREATE TEMP TABLE uc023_old_procs ON COMMIT DROP AS SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc023_old_types ON COMMIT DROP AS SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc023_old_constraints ON COMMIT DROP AS SELECT c.oid FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc023_old_triggers ON COMMIT DROP AS SELECT t.oid FROM pg_trigger t JOIN uc023_old_classes c ON c.oid=t.tgrelid;
CREATE TEMP TABLE uc023_old_policies ON COMMIT DROP AS SELECT p.oid FROM pg_policy p JOIN uc023_old_classes c ON c.oid=p.polrelid;
CREATE TEMP TABLE uc023_old_defaults ON COMMIT DROP AS SELECT d.oid FROM pg_attrdef d JOIN uc023_old_classes c ON c.oid=d.adrelid;
CREATE TEMP TABLE uc023_old_namespaces ON COMMIT DROP AS SELECT oid FROM pg_namespace WHERE nspname IN('public','auth','storage','supabase_migrations');
CREATE TEMP TABLE uc023_allowed_parent_fks(constraint_name text PRIMARY KEY,child_table text,parent_table text) ON COMMIT DROP;
-- No allowed new FK references to existing tables: any addition is refused below.
CREATE FUNCTION pg_temp.uc023_capture_guard() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $capture$
DECLARE guard_table record;guard_count bigint;guard_sha text;guard_data jsonb:='{}';guard_result jsonb;
BEGIN
 FOR guard_table IN SELECT * FROM uc023_old_classes WHERE relkind IN('r','p') ORDER BY oid LOOP
  EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,%L ORDER BY row_hash COLLATE "C"),%L),%L)),%L) FROM (SELECT encode(sha256(convert_to(to_jsonb(guard_r)::text,%L)),%L) row_hash FROM (SELECT %s FROM %I.%I) guard_r) guard_hashed','','','UTF8','hex','UTF8','hex',guard_table.projection,guard_table.nspname,guard_table.relname) INTO guard_count,guard_sha;
  guard_data:=guard_data||jsonb_build_object(guard_table.nspname||'.'||guard_table.relname,jsonb_build_object('rows',guard_count,'sha256',guard_sha));
 END LOOP;
 SELECT jsonb_build_object(
 'data',guard_data,
 'classes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(CASE WHEN o.nspname='public'AND o.relname='data_subject_requests'THEN(to_jsonb(c)-'relnatts'-'relchecks'-'relacl')||jsonb_build_object('relnatts',o.metadata->'relnatts','relchecks',o.metadata->'relchecks','relacl',pg_temp.uc023_acl_keep(c.relacl,c.relowner,false))ELSE to_jsonb(c)END ORDER BY c.oid)::text,''),'UTF8')),'hex')FROM pg_class c JOIN uc023_old_classes o ON o.oid=c.oid),
 'attributes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(CASE WHEN o.nspname='public'AND o.relname='data_subject_requests'THEN(to_jsonb(a)-'attacl')||jsonb_build_object('attacl',pg_temp.uc023_acl_keep(a.attacl,(SELECT relowner FROM pg_class WHERE oid=a.attrelid),true))ELSE to_jsonb(a)END ORDER BY a.attrelid,a.attnum)::text,''),'UTF8')),'hex')FROM pg_attribute a JOIN uc023_old_attributes x ON x.attrelid=a.attrelid AND x.attnum=a.attnum JOIN uc023_old_classes o ON o.oid=a.attrelid),
 'defaults',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid)::text,''),'UTF8')),'hex') FROM pg_attrdef d JOIN uc023_old_defaults o ON o.oid=d.oid),
 'constraints',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_constraint c JOIN uc023_old_constraints o ON o.oid=c.oid WHERE NOT(c.conrelid='public.data_subject_requests'::regclass AND c.conname='data_subject_requests_request_type_check')),
 'triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_trigger t JOIN uc023_old_triggers o ON o.oid=t.oid),
 'policies',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_policy p JOIN uc023_old_policies o ON o.oid=p.oid),
 'indexes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid)::text,''),'UTF8')),'hex') FROM pg_index i JOIN uc023_old_classes o ON o.oid=i.indexrelid),
 'functions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg((to_jsonb(p)-'prosrc')||jsonb_build_object('source_sha256',CASE WHEN EXISTS(SELECT 1 FROM uc023_body_allowlist a WHERE p.oid=to_regprocedure(a.signature)) THEN '__EXACT_TWO_BODY_ALLOWLIST__' ELSE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') END) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_proc p JOIN uc023_old_procs o ON o.oid=p.oid),
 'roles',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid)::text,''),'UTF8')),'hex') FROM pg_roles r),
 'role_memberships',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.roleid,a.member,a.grantor)::text,''),'UTF8')),'hex') FROM pg_auth_members a),
 'role_settings',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.setdatabase,a.setrole)::text,''),'UTF8')),'hex') FROM pg_db_role_setting a),
 'default_acl',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid)::text,''),'UTF8')),'hex') FROM pg_default_acl a),
 'types',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_type t JOIN uc023_old_types o ON o.oid=t.oid),
 'enum_values',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.enumtypid,e.enumsortorder,e.oid)::text,''),'UTF8')),'hex') FROM pg_enum e JOIN uc023_old_types o ON o.oid=e.enumtypid),
 'range_definitions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.rngtypid)::text,''),'UTF8')),'hex') FROM pg_range r JOIN uc023_old_types o ON o.oid=r.rngtypid),
 'schemas',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.oid)::text,''),'UTF8')),'hex') FROM pg_namespace n WHERE n.nspname !~ '^pg_(toast_)?temp_'),
 'extensions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_extension e),
 'event_triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_event_trigger e),
 'ledger_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'ledger_sha256',(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),'' ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex') FROM supabase_migrations.schema_migrations m)
 ) INTO guard_result;RETURN guard_result;
END $capture$;
CREATE TEMP TABLE uc023_guard_before ON COMMIT DROP AS SELECT pg_temp.uc023_capture_guard() value;
`;

const suffix = `
DO $post$ DECLARE guard_before jsonb;guard_after jsonb;guard_new_table text;guard_new_rows boolean;BEGIN

 IF EXISTS(SELECT 1 FROM uc023_old_classes o LEFT JOIN pg_class c ON c.oid=o.oid WHERE c.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_attributes o LEFT JOIN pg_attribute a ON a.attrelid=o.attrelid AND a.attnum=o.attnum WHERE a.attrelid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_procs o LEFT JOIN pg_proc p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_types o LEFT JOIN pg_type t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_triggers o LEFT JOIN pg_trigger t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_policies o LEFT JOIN pg_policy p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_defaults o LEFT JOIN pg_attrdef d ON d.oid=o.oid WHERE d.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc023_old_constraints o LEFT JOIN pg_constraint c ON c.oid=o.oid WHERE c.oid IS NULL AND o.oid<>ALL(ARRAY(SELECT(x->'metadata'->>'oid')::oid FROM uc023_expected_catalog e CROSS JOIN LATERAL jsonb_array_elements(e.value->'productionPreImage'->'old_dsr_constraints')x WHERE x->>'name'='data_subject_requests_request_type_check')))
 THEN RAISE EXCEPTION 'UC023_UNDECLARED_OLD_OBJECT_DISAPPEARED';END IF;
 SELECT value INTO STRICT guard_before FROM uc023_guard_before;guard_after:=pg_temp.uc023_capture_guard();
 IF guard_before IS DISTINCT FROM guard_after THEN RAISE EXCEPTION 'UC023_PRESERVATION_FAILED: %',(SELECT jsonb_agg(k) FROM jsonb_object_keys(guard_before)k WHERE guard_before->k IS DISTINCT FROM guard_after->k);END IF;
 IF EXISTS(SELECT 1 FROM uc023_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.new_md5)THEN RAISE EXCEPTION 'UC023_EXACT_NEW_BODY_MISMATCH';END IF;
 IF(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc023_old_classes o WHERE o.oid=c.oid))<>1
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc023_old_classes o WHERE o.oid=c.oid)AND(c.relname<>ALL(${newTableArray})OR NOT c.relrowsecurity OR c.relforcerowsecurity OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(c.relacl,acldefault('r',c.relowner)),'{}'::aclitem[]))a WHERE a.grantee<>c.relowner)))
 THEN RAISE EXCEPTION 'UC023_NEW_TABLE_ACL_OR_INVENTORY_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc023_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NULL)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc023_old_procs o WHERE o.oid=p.oid)AND NOT EXISTS(SELECT 1 FROM uc023_new_function_allowlist a WHERE n.nspname='public'AND to_regprocedure(a.signature)=p.oid))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN uc023_new_function_allowlist f ON p.oid=to_regprocedure(f.signature)WHERE p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE a.grantee<>p.proowner AND NOT(p.oid=ANY(${rpcArray})AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable)))
 OR EXISTS(SELECT 1 FROM unnest(${rpcArray})AS rpc(rpc_oid) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE p.oid=rpc.rpc_oid AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable))
 THEN RAISE EXCEPTION 'UC023_NEW_FUNCTION_ACL_OR_INVENTORY_MISMATCH';END IF;
 -- No additions to an old relation can hide behind the old-OID snapshots.
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('auth','storage')AND NOT EXISTS(SELECT 1 FROM uc023_old_classes o WHERE o.oid=c.oid))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND NOT EXISTS(SELECT 1 FROM uc023_old_classes o WHERE o.oid=c.oid)AND NOT(c.relkind IN('r','p')AND c.relname=ANY(${newTableArray})OR c.relkind IN('i','I')AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_class r ON r.oid=i.indrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE i.indexrelid=c.oid AND rn.nspname='public'AND r.relname=ANY(${newTableArray}))))
 OR EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc023_old_constraints o WHERE o.oid=c.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE r.oid=c.conrelid AND rn.nspname='public'AND r.relname=ANY(${newTableArray}))AND NOT(c.conrelid='public.data_subject_requests'::regclass AND c.conname IN('data_subject_requests_request_type_check','data_subject_requests_deadline_revision_check','data_subject_requests_deadline_details_check')))
 OR EXISTS(SELECT 1 FROM pg_policy p JOIN uc023_old_classes r ON r.oid=p.polrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_policies o WHERE o.oid=p.oid))
 OR EXISTS(SELECT 1 FROM pg_attrdef d JOIN uc023_old_classes r ON r.oid=d.adrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_defaults o WHERE o.oid=d.oid)AND NOT(d.adrelid='public.data_subject_requests'::regclass AND d.adnum=(SELECT attnum FROM pg_attribute WHERE attrelid=d.adrelid AND attname='deadline_revision')))
 OR EXISTS(SELECT 1 FROM pg_index i JOIN uc023_old_classes r ON r.oid=i.indrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_classes o WHERE o.oid=i.indexrelid))
 OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc023_old_types o WHERE o.oid=t.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace JOIN pg_type rt ON rt.oid=r.reltype WHERE rn.nspname='public'AND r.relname=ANY(${newTableArray})AND t.oid IN(r.reltype,rt.typarray)))
 THEN RAISE EXCEPTION 'UC023_UNDECLARED_ADDITIVE_CATALOG_OBJECT';END IF;
 IF(SELECT count(*)FROM pg_trigger t JOIN uc023_old_classes o ON o.oid=t.tgrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_triggers x WHERE x.oid=t.oid))<>4
 OR (SELECT jsonb_agg(jsonb_build_object('parent_schema',pn.nspname,'parent_table',pr.relname,'child_schema',cn.nspname,'child_table',cr.relname,'constraint_name',c.conname,'constraint_definition',pg_get_constraintdef(c.oid,true),'function_identity',fnn.nspname||'.'||quote_ident(fn.proname)||'('||pg_get_function_identity_arguments(fn.oid)||')','tgtype',t.tgtype,'tgenabled',t.tgenabled,'tgisinternal',t.tgisinternal,'tgdeferrable',t.tgdeferrable,'tginitdeferred',t.tginitdeferred,'tgnargs',t.tgnargs,'tgargs_hex',encode(t.tgargs,'hex'),'tgattr',t.tgattr::text,'confupdtype',c.confupdtype,'confdeltype',c.confdeltype,'confmatchtype',c.confmatchtype,'convalidated',c.convalidated)ORDER BY pn.nspname,pr.relname,c.conname,t.tgtype)FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint JOIN pg_class pr ON pr.oid=t.tgrelid JOIN pg_namespace pn ON pn.oid=pr.relnamespace JOIN pg_class cr ON cr.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=cr.relnamespace JOIN pg_proc fn ON fn.oid=t.tgfoid JOIN pg_namespace fnn ON fnn.oid=fn.pronamespace WHERE NOT EXISTS(SELECT 1 FROM uc023_old_triggers ot WHERE ot.oid=t.oid)AND t.tgrelid IN(SELECT oid FROM uc023_old_classes)AND t.tgisinternal AND c.contype='f'AND c.conrelid='public.data_subject_request_deadline_events'::regclass AND c.confrelid=t.tgrelid) IS DISTINCT FROM(SELECT value->'nativeParentFKTriggers'FROM uc023_expected_catalog)
 THEN RAISE EXCEPTION 'UC023_EXACT_FOUR_PARENT_FK_TRIGGER_MISMATCH';END IF;

 IF(SELECT relnatts FROM pg_class WHERE oid='public.data_subject_requests'::regclass)<>(SELECT (metadata->>'relnatts')::int+2 FROM uc023_old_classes WHERE oid='public.data_subject_requests'::regclass)
 OR(SELECT relchecks FROM pg_class WHERE oid='public.data_subject_requests'::regclass)<>(SELECT (metadata->>'relchecks')::int+2 FROM uc023_old_classes WHERE oid='public.data_subject_requests'::regclass)
 OR EXISTS(SELECT 1 FROM data_subject_requests WHERE deadline_details IS NOT NULL OR deadline_revision<>0)
 OR(SELECT count(*)FROM pg_attribute a JOIN uc023_old_classes o ON o.oid=a.attrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_attributes x WHERE x.attrelid=a.attrelid AND x.attnum=a.attnum))<>2
 OR EXISTS(SELECT 1 FROM pg_attribute a JOIN uc023_old_classes o ON o.oid=a.attrelid WHERE NOT EXISTS(SELECT 1 FROM uc023_old_attributes x WHERE x.attrelid=a.attrelid AND x.attnum=a.attnum)AND NOT(a.attrelid='public.data_subject_requests'::regclass AND a.attname IN('deadline_details','deadline_revision')AND a.attnum=(o.metadata->>'relnatts')::int+CASE a.attname WHEN 'deadline_details'THEN 1 ELSE 2 END))
 OR EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid IN(SELECT (x->'metadata'->>'oid')::oid FROM uc023_expected_catalog e CROSS JOIN LATERAL jsonb_array_elements(e.value->'productionPreImage'->'old_dsr_constraints')x WHERE x->>'name'='data_subject_requests_request_type_check'))
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(NULLIF(coalesce(c.relacl,acldefault('r',c.relowner)),'{}'::aclitem[]))x WHERE c.oid='public.data_subject_requests'::regclass AND x.grantee IN(0::oid,(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated')))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(NULLIF(a.attacl,'{}'::aclitem[]))x WHERE a.attrelid='public.data_subject_requests'::regclass AND x.grantee IN(0::oid,(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated')))
 THEN RAISE EXCEPTION 'UC023_EXACT_TWO_COLUMNS_OLD_DEFAULTS_OR_DIRECT_ACL_MISMATCH';END IF;
 IF(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text)ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.data_subject_requests'::regclass AND a.attname IN('deadline_details','deadline_revision'))IS DISTINCT FROM(SELECT value->'newDSRColumns'FROM uc023_expected_catalog)
 THEN RAISE EXCEPTION 'UC023_EXACT_NEW_COLUMN_SHAPE_MISMATCH';END IF;
 IF(SELECT count(*)FROM pg_trigger t WHERE t.tgrelid='public.data_subject_request_deadline_events'::regclass)<>4
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint JOIN pg_proc f ON f.oid=t.tgfoid JOIN pg_namespace n ON n.oid=f.pronamespace WHERE t.tgrelid='public.data_subject_request_deadline_events'::regclass AND NOT(t.tgisinternal AND t.tgenabled='O'AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND encode(t.tgargs,'hex')=''AND t.tgattr::text=''AND c.contype='f'AND c.conrelid=t.tgrelid AND c.conname IN('data_subject_request_deadline_events_actor_id_fkey','data_subject_request_deadline_events_request_id_fkey')AND n.nspname='pg_catalog'AND(t.tgtype=5 AND f.proname='RI_FKey_check_ins'OR t.tgtype=17 AND f.proname='RI_FKey_check_upd')))
 THEN RAISE EXCEPTION 'UC023_NEW_HISTORY_FK_CHECK_TRIGGER_MISMATCH';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('signature','public.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')','source_md5',md5(p.prosrc),'portable',jsonb_build_object('owner',pg_get_userbyid(p.proowner),'language',l.lanname,'kind',p.prokind,'security_definer',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,'set_returning',p.proretset,'volatility',p.provolatile,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows,'config',p.proconfig,'arg_names',p.proargnames,'identity_args',pg_get_function_identity_arguments(p.oid),'full_args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl::text))ORDER BY p.proname)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public'AND p.proname=ANY(ARRAY['uc_dsr_working_2026','uc_dsr_add_days','uc_dsr_can_manage','uc_dsr_fence','uc_dsr_authority_fence','uc_dsr_create','uc_dsr_list','uc_dsr_apply'])) IS DISTINCT FROM(SELECT value->'portableNewFunctions'FROM uc023_expected_catalog)THEN RAISE EXCEPTION 'UC023_EXACT_NATIVE_FUNCTION_BODY_AND_METADATA_MISMATCH';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid,true),'type',c.contype,'deferrable',c.condeferrable,'deferred',c.condeferred,'validated',c.convalidated)ORDER BY c.conname)FROM pg_constraint c WHERE c.conrelid='public.data_subject_requests'::regclass AND c.conname IN('data_subject_requests_request_type_check','data_subject_requests_deadline_revision_check','data_subject_requests_deadline_details_check')) IS DISTINCT FROM(SELECT value->'newDSRConstraints'FROM uc023_expected_catalog)THEN RAISE EXCEPTION 'UC023_EXACT_THREE_DSR_CHECKS_MISMATCH';END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text)ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.data_subject_request_deadline_events'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM(SELECT value->'newHistoryColumns'FROM uc023_expected_catalog)OR (SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid,true),'type',c.contype,'deferrable',c.condeferrable,'deferred',c.condeferred,'validated',c.convalidated,'update',c.confupdtype,'delete',c.confdeltype,'match',c.confmatchtype)ORDER BY c.conname)FROM pg_constraint c WHERE c.conrelid='public.data_subject_request_deadline_events'::regclass) IS DISTINCT FROM(SELECT value->'newHistoryConstraints'FROM uc023_expected_catalog)THEN RAISE EXCEPTION 'UC023_EXACT_NEW_HISTORY_SHAPE_MISMATCH';END IF;

 FOREACH guard_new_table IN ARRAY ${newTableArray} LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',guard_new_table) INTO guard_new_rows;
  IF guard_new_rows THEN RAISE EXCEPTION 'UC023_NEW_TABLE_NOT_EMPTY: %',guard_new_table;END IF;
 END LOOP;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)VALUES(${quote(version)},'uc_personal_data_request_deadlines',ARRAY[${quote(raw)}],NULL,NULL,NULL);
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations)<>619
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${quote(version)}AND name='uc_personal_data_request_deadlines'AND cardinality(statements)=1 AND md5(statements[1])=md5(${quote(raw)})AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL)
 OR(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),''ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex')FROM supabase_migrations.schema_migrations m WHERE version<>${quote(version)})IS DISTINCT FROM guard_before->>'ledger_sha256'
 THEN RAISE EXCEPTION 'UC023_EXACT_LEDGER_MISMATCH';END IF;
END $post$;
SELECT jsonb_build_object('status','PASS','kind','UC023_ATOMIC619_PRESERVATION','migration',${quote(version)},'raw_sha256',${quote(sha(raw))},'ledger_before',618,'ledger_inside',619,'old_public_table_sets',338,'old_auth_storage_public_table_sets',(SELECT count(*)FROM jsonb_object_keys((SELECT value->'data'FROM uc023_guard_before))),'all_old_rows_metadata_acl_roles_and_ledger_preserved',true,'allowed_body_changes',(SELECT jsonb_agg(jsonb_build_object('signature',a.signature,'old_md5',a.old_md5,'new_md5',a.new_md5)ORDER BY a.signature)FROM uc023_body_allowlist a),'data_digest',(SELECT encode(sha256(convert_to((value->'data')::text,'UTF8')),'hex')FROM uc023_guard_before),'preservation_before',(SELECT value-'data'FROM uc023_guard_before))AS uc023_release;
`;
await fs.mkdir(outputDir,{recursive:true});
const body = prefix+raw+suffix;
const rehearsal = body+'\nROLLBACK;\n';
const commit = body+'\nCOMMIT;\n';
if (rehearsal.replace(/ROLLBACK;\n$/,'COMMIT;\n')!==commit) throw new Error('Terminal-only equivalence failure');
await fs.writeFile(path.join(outputDir,'rehearsal.sql'),rehearsal,{flag:'wx'});
await fs.writeFile(path.join(outputDir,'commit.sql'),commit,{flag:'wx'});
const hold={kind:'SOURCE_ONLY_NOT_EXECUTION',at:new Date().toISOString(),migrationFile,configFile,sourceSHA256:sha(await fs.readFile(new URL(import.meta.url))),rawSHA256:sha(raw),rawMD5:crypto.createHash('md5').update(raw).digest('hex'),configSHA256:sha(await fs.readFile(configFile)),rehearsalSHA256:sha(rehearsal),commitSHA256:sha(commit),terminalOnlyDifference:true,oldBodies,newBodyMD5:config.newBodyMD5,newTables,newFunctions:config.newFunctions,nativeParentFKTriggers:config.nativeParentFKTriggers,ledgerBefore:618,ledgerInside:619};
await fs.writeFile(path.join(outputDir,'SOURCE_HOLD.json'),JSON.stringify(hold,null,2),{flag:'wx'});
console.log(JSON.stringify(hold));
