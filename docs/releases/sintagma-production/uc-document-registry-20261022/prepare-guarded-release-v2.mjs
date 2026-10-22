import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Source producer only. This file never opens a connection or runs SQL.
export async function prepare(migrationFile, configFile, outputDir) {
if (!migrationFile || !configFile || !outputDir) throw new Error('migration, reviewed config and output directory required');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const quote = text => "'" + text.replaceAll("'", "''") + "'";
const raw = await fs.readFile(migrationFile, 'utf8');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const version = '20261022230000';
const newTables = ['uc_document_registry_heads','uc_document_registry_records','uc_document_registry_events','uc_document_registry_requests','uc_document_registry_incoming_sources'];
const rpcSignatures = ['public.read_document_registry(uuid,jsonb,jsonb)','public.apply_document_registry_action(uuid,jsonb,bigint,uuid,jsonb)'];
const oldBodies = {
  'public.uc_scoped_journal_personal_counts(uuid)':'990d91cfef61c08fa87a10c90ce2f3d7',
  'public.uc_scoped_journal_erase_user(uuid)':'20e51ce5c3233d472ca94884ad3ad4c7',
};
if (path.basename(migrationFile) !== version+'_uc_document_registry.sql' || /\r/.test(raw)) throw new Error('Canonical LF exact migration required');
if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(raw)) throw new Error('Outer transaction belongs to producer');
if (config.rawSHA256 !== sha(raw) || config.expectedLedger !== 619 || config.expectedPublicTables !== 339 || config.expectedAllTableSets !== 374) throw new Error('Source or baseline mismatch');
if (JSON.stringify(config.newTables) !== JSON.stringify(newTables)) throw new Error('Exact five reviewed registry tables required');
if (!Array.isArray(config.newFunctions) || config.newFunctions.length!==34 || new Set(config.newFunctions).size !== config.newFunctions.length
  || config.newFunctions.some(s => !/^public\.(?:uc_document_registry_[a-z_]+|read_document_registry|apply_document_registry_action)\([a-z0-9_, .\[\]]*\)$/.test(s))
  || rpcSignatures.some(s => !config.newFunctions.includes(s))) throw new Error('Explicit bounded new function signatures required');
if (JSON.stringify(Object.keys(config.newBodyMD5).sort()) !== JSON.stringify(Object.keys(oldBodies).sort())
  || Object.entries(config.newBodyMD5).some(([s,h]) => !/^[0-9a-f]{32}$/.test(h) || h === oldBodies[s])) throw new Error('Actual native new body digests required');
if (!Array.isArray(config.nativeParentFKTriggers) || config.nativeParentFKTriggers.length !== 0) throw new Error('No new FK triggers may be added to old tables; exact native empty inventory required');
const bodyRows = Object.entries(oldBodies).map(([signature, old]) => `(${quote(signature)},${quote(old)},${quote(config.newBodyMD5[signature])})`).join(',\n');
const newFunctionRows = config.newFunctions.map(s => `(${quote(s)})`).join(',\n');
const newTableArray = 'ARRAY['+newTables.map(quote).join(',')+']';
const rpcArray = 'ARRAY['+rpcSignatures.map(s => `${quote(s)}::regprocedure::oid`).join(',')+']';

const catalogRaw=await fs.readFile(new URL('./uc018-collect-portable-catalog.sql',import.meta.url),'utf8');
if(sha(catalogRaw)!=='5d8bddba45199bf986f2116aa865a3f8b9fe469a24bd1c73bd6cc687c2891144'||config.portableCatalogSQLSHA256!==sha(catalogRaw))throw Error('Exact reviewed portable query required');
if(!config.nativePortableCatalog||config.nativePortableCatalog.functions.length!==34||config.nativePortableCatalog.tables.length!==5)throw Error('Actual portable34/5 catalog required');
if(!config.productionPolicyPreImage||config.productionPolicyPreImage.metadata.polname!=='uc_document_assigned_read'||config.productionPolicyPreImage.qual_md5!=='5fdd3fc60911993f9f665aa7e6ed2bc4'||config.newPolicyQualMD5!=='c0d8fe4238846f228fcb285c97cb13b2')throw Error('Exact reviewed old/new policy required');
const prefix = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path=pg_catalog,public;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL standard_conforming_strings=on;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='5s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc018_body_allowlist(signature text PRIMARY KEY,old_md5 text NOT NULL,new_md5 text NOT NULL) ON COMMIT DROP;
INSERT INTO uc018_body_allowlist VALUES ${bodyRows};
CREATE TEMP TABLE uc018_new_function_allowlist(signature text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO uc018_new_function_allowlist VALUES ${newFunctionRows};
CREATE TEMP TABLE uc018_expected_catalog(value jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO uc018_expected_catalog VALUES (${quote(JSON.stringify(config))}::jsonb);
CREATE FUNCTION pg_temp.uc018_capture_new_catalog() RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $portable$
${catalogRaw}
$portable$;
DO $pre$ BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>619
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p'))<>339
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${quote(version)})
 OR EXISTS(SELECT 1 FROM uc018_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.old_md5)
 OR EXISTS(SELECT 1 FROM uc018_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(${newTableArray}))
 THEN RAISE EXCEPTION 'UC018_PRE620_BASELINE_MISMATCH';END IF;
 IF(SELECT count(*)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage')AND c.relkind IN('r','p'))<>374
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022220000'AND name='uc_personal_data_request_deadlines'AND cardinality(statements)=1 AND encode(sha256(convert_to(statements[1],'UTF8')),'hex')='53b11125da06f9024685c962c93978652fd3f6af70101ff46b300085d95ed05f'AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL)
 OR(SELECT to_jsonb(p)FROM pg_policy p WHERE p.polrelid='public.document_issuance_log'::regclass AND p.polname='uc_document_assigned_read')IS DISTINCT FROM(SELECT value->'productionPolicyPreImage'->'metadata'FROM uc018_expected_catalog)
 THEN RAISE EXCEPTION 'UC018_EXACT_619_ROWS_LEDGER_POLICY_PREIMAGE_MISMATCH';END IF;
END $pre$;
-- Inventory predates all new application objects. Existing object bodies, ACL,
-- identities and definition tuples remain compared by exact existing OID.
CREATE TEMP TABLE uc018_old_classes ON COMMIT DROP AS SELECT c.oid,n.nspname,c.relname,c.relkind,(SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)projection FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage');
CREATE TEMP TABLE uc018_old_procs ON COMMIT DROP AS SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc018_old_types ON COMMIT DROP AS SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc018_old_constraints ON COMMIT DROP AS SELECT c.oid FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_';
CREATE TEMP TABLE uc018_old_triggers ON COMMIT DROP AS SELECT t.oid FROM pg_trigger t JOIN uc018_old_classes c ON c.oid=t.tgrelid;
CREATE TEMP TABLE uc018_old_policies ON COMMIT DROP AS SELECT p.oid FROM pg_policy p JOIN uc018_old_classes c ON c.oid=p.polrelid;
CREATE TEMP TABLE uc018_old_defaults ON COMMIT DROP AS SELECT d.oid FROM pg_attrdef d JOIN uc018_old_classes c ON c.oid=d.adrelid;
CREATE TEMP TABLE uc018_old_namespaces ON COMMIT DROP AS SELECT oid FROM pg_namespace WHERE nspname IN('public','auth','storage','supabase_migrations');
CREATE TEMP TABLE uc018_allowed_parent_fks(constraint_name text PRIMARY KEY,child_table text,parent_table text) ON COMMIT DROP;
-- No allowed new FK references to existing tables: any addition is refused below.
CREATE FUNCTION pg_temp.uc018_capture_guard() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $capture$
DECLARE guard_table record;guard_count bigint;guard_sha text;guard_data jsonb:='{}';guard_result jsonb;
BEGIN
 FOR guard_table IN SELECT * FROM uc018_old_classes WHERE relkind IN('r','p') ORDER BY oid LOOP
  EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,%L ORDER BY row_hash COLLATE "C"),%L),%L)),%L) FROM (SELECT encode(sha256(convert_to(to_jsonb(guard_r)::text,%L)),%L) row_hash FROM (SELECT %s FROM %I.%I) guard_r) guard_hashed','','','UTF8','hex','UTF8','hex',guard_table.projection,guard_table.nspname,guard_table.relname) INTO guard_count,guard_sha;
  guard_data:=guard_data||jsonb_build_object(guard_table.nspname||'.'||guard_table.relname,jsonb_build_object('rows',guard_count,'sha256',guard_sha));
 END LOOP;
 SELECT jsonb_build_object(
 'data',guard_data,
 'classes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_class c JOIN uc018_old_classes o ON o.oid=c.oid),
 'attributes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,a.attisdropped,a.attacl::text,a.attoptions,a.attfdwoptions,a.atthasdef,a.attstorage,a.attcompression,a.attmissingval::text) ORDER BY a.attrelid,a.attnum)::text,''),'UTF8')),'hex') FROM pg_attribute a JOIN uc018_old_classes o ON o.oid=a.attrelid),
 'defaults',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid)::text,''),'UTF8')),'hex') FROM pg_attrdef d JOIN uc018_old_defaults o ON o.oid=d.oid),
 'constraints',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid)::text,''),'UTF8')),'hex') FROM pg_constraint c JOIN uc018_old_constraints o ON o.oid=c.oid),
 'triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_trigger t JOIN uc018_old_triggers o ON o.oid=t.oid),
 'policies',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(CASE WHEN p.oid=(SELECT(value->'productionPolicyPreImage'->'metadata'->>'oid')::oid FROM uc018_expected_catalog)THEN(to_jsonb(p)-'polqual')||jsonb_build_object('polqual','__EXACT_ONE_QUAL_ALLOWLIST__')ELSE to_jsonb(p)END ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_policy p JOIN uc018_old_policies o ON o.oid=p.oid),
 'indexes',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid)::text,''),'UTF8')),'hex') FROM pg_index i JOIN uc018_old_classes o ON o.oid=i.indexrelid),
 'functions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg((to_jsonb(p)-'prosrc')||jsonb_build_object('source_sha256',CASE WHEN EXISTS(SELECT 1 FROM uc018_body_allowlist a WHERE p.oid=to_regprocedure(a.signature)) THEN '__EXACT_TWO_BODY_ALLOWLIST__' ELSE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') END) ORDER BY p.oid)::text,''),'UTF8')),'hex') FROM pg_proc p JOIN uc018_old_procs o ON o.oid=p.oid),
 'roles',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid)::text,''),'UTF8')),'hex') FROM pg_roles r),
 'role_memberships',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.roleid,a.member,a.grantor)::text,''),'UTF8')),'hex') FROM pg_auth_members a),
 'role_settings',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.setdatabase,a.setrole)::text,''),'UTF8')),'hex') FROM pg_db_role_setting a),
 'default_acl',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid)::text,''),'UTF8')),'hex') FROM pg_default_acl a),
 'types',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid)::text,''),'UTF8')),'hex') FROM pg_type t JOIN uc018_old_types o ON o.oid=t.oid),
 'enum_values',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.enumtypid,e.enumsortorder,e.oid)::text,''),'UTF8')),'hex') FROM pg_enum e JOIN uc018_old_types o ON o.oid=e.enumtypid),
 'range_definitions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.rngtypid)::text,''),'UTF8')),'hex') FROM pg_range r JOIN uc018_old_types o ON o.oid=r.rngtypid),
 'schemas',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.oid)::text,''),'UTF8')),'hex') FROM pg_namespace n WHERE n.nspname !~ '^pg_(toast_)?temp_'),
 'extensions',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_extension e),
 'event_triggers',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text,''),'UTF8')),'hex') FROM pg_event_trigger e),
 'ledger_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'ledger_sha256',(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),'' ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex') FROM supabase_migrations.schema_migrations m)
 ) INTO guard_result;RETURN guard_result;
END $capture$;
CREATE TEMP TABLE uc018_guard_before ON COMMIT DROP AS SELECT pg_temp.uc018_capture_guard() value;
`;

const suffix = `
DO $post$ DECLARE guard_before jsonb;guard_after jsonb;guard_new_table text;guard_new_rows boolean;BEGIN
 IF (SELECT to_jsonb(p)-'polqual' FROM pg_policy p WHERE p.oid=(SELECT(value->'productionPolicyPreImage'->'metadata'->>'oid')::oid FROM uc018_expected_catalog))IS DISTINCT FROM(SELECT(value->'productionPolicyPreImage'->'metadata')-'polqual' FROM uc018_expected_catalog)
 OR(SELECT md5(pg_get_expr(p.polqual,p.polrelid))FROM pg_policy p WHERE p.oid=(SELECT(value->'productionPolicyPreImage'->'metadata'->>'oid')::oid FROM uc018_expected_catalog))IS DISTINCT FROM ${quote(config.newPolicyQualMD5)}
 THEN RAISE EXCEPTION 'UC018_EXACT_ONE_OLD_POLICY_QUAL_MISMATCH';END IF;
 IF pg_temp.uc018_capture_new_catalog()IS DISTINCT FROM(SELECT value->'nativePortableCatalog'FROM uc018_expected_catalog)THEN RAISE EXCEPTION 'UC018_EXACT_PORTABLE_NEW_FUNCTION_TABLE_CATALOG_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc018_old_classes o LEFT JOIN pg_class c ON c.oid=o.oid WHERE c.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_procs o LEFT JOIN pg_proc p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_types o LEFT JOIN pg_type t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_triggers o LEFT JOIN pg_trigger t ON t.oid=o.oid WHERE t.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_policies o LEFT JOIN pg_policy p ON p.oid=o.oid WHERE p.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_defaults o LEFT JOIN pg_attrdef d ON d.oid=o.oid WHERE d.oid IS NULL)
 OR EXISTS(SELECT 1 FROM uc018_old_constraints o LEFT JOIN pg_constraint c ON c.oid=o.oid WHERE c.oid IS NULL)
 THEN RAISE EXCEPTION 'UC018_UNDECLARED_OLD_OBJECT_DISAPPEARED';END IF;
 SELECT value INTO STRICT guard_before FROM uc018_guard_before;guard_after:=pg_temp.uc018_capture_guard();
 IF guard_before IS DISTINCT FROM guard_after THEN RAISE EXCEPTION 'UC018_PRESERVATION_FAILED: %',(SELECT jsonb_agg(k) FROM jsonb_object_keys(guard_before)k WHERE guard_before->k IS DISTINCT FROM guard_after->k);END IF;
 IF EXISTS(SELECT 1 FROM uc018_body_allowlist a LEFT JOIN pg_proc p ON p.oid=to_regprocedure(a.signature) WHERE p.oid IS NULL OR md5(p.prosrc)<>a.new_md5)THEN RAISE EXCEPTION 'UC018_EXACT_NEW_BODY_MISMATCH';END IF;
 IF(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc018_old_classes o WHERE o.oid=c.oid))<>5
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT EXISTS(SELECT 1 FROM uc018_old_classes o WHERE o.oid=c.oid)AND(c.relname<>ALL(${newTableArray})OR NOT c.relrowsecurity OR c.relforcerowsecurity OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(c.relacl,acldefault('r',c.relowner)),'{}'::aclitem[]))a WHERE a.grantee<>c.relowner)))
 THEN RAISE EXCEPTION 'UC018_NEW_TABLE_ACL_OR_INVENTORY_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc018_new_function_allowlist a WHERE to_regprocedure(a.signature) IS NULL)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc018_old_procs o WHERE o.oid=p.oid)AND NOT EXISTS(SELECT 1 FROM uc018_new_function_allowlist a WHERE n.nspname='public'AND to_regprocedure(a.signature)=p.oid))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN uc018_new_function_allowlist f ON p.oid=to_regprocedure(f.signature)WHERE p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR EXISTS(SELECT 1 FROM aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE a.grantee<>p.proowner AND NOT(p.oid=ANY(${rpcArray})AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable)))
 OR EXISTS(SELECT 1 FROM unnest(${rpcArray})AS rpc(rpc_oid) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(NULLIF(coalesce(p.proacl,acldefault('f',p.proowner)),'{}'::aclitem[]))a WHERE p.oid=rpc.rpc_oid AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable))
 THEN RAISE EXCEPTION 'UC018_NEW_FUNCTION_ACL_OR_INVENTORY_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM uc018_new_function_allowlist f CROSS JOIN unnest(ARRAY['authenticated','anon','service_role'])role_name WHERE has_function_privilege(role_name,to_regprocedure(f.signature),'EXECUTE')IS DISTINCT FROM(role_name='authenticated'AND to_regprocedure(f.signature)::oid=ANY(${rpcArray})))
 THEN RAISE EXCEPTION 'UC018_NEW_FUNCTION_EFFECTIVE_EXECUTE_MISMATCH';END IF;
 -- No additions to an old relation can hide behind the old-OID snapshots.
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('auth','storage')AND NOT EXISTS(SELECT 1 FROM uc018_old_classes o WHERE o.oid=c.oid))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND NOT EXISTS(SELECT 1 FROM uc018_old_classes o WHERE o.oid=c.oid)AND NOT(c.relkind IN('r','p')AND c.relname=ANY(${newTableArray})OR c.relkind IN('i','I')AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_class r ON r.oid=i.indrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE i.indexrelid=c.oid AND rn.nspname='public'AND r.relname=ANY(${newTableArray}))))
 OR EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc018_old_constraints o WHERE o.oid=c.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE r.oid=c.conrelid AND rn.nspname='public'AND r.relname=ANY(${newTableArray})))
 OR EXISTS(SELECT 1 FROM pg_policy p JOIN uc018_old_classes r ON r.oid=p.polrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_policies o WHERE o.oid=p.oid))
 OR EXISTS(SELECT 1 FROM pg_attrdef d JOIN uc018_old_classes r ON r.oid=d.adrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_defaults o WHERE o.oid=d.oid))
 OR EXISTS(SELECT 1 FROM pg_index i JOIN uc018_old_classes r ON r.oid=i.indrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_classes o WHERE o.oid=i.indexrelid))
 OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_(toast_)?temp_'AND NOT EXISTS(SELECT 1 FROM uc018_old_types o WHERE o.oid=t.oid)AND NOT EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace rn ON rn.oid=r.relnamespace JOIN pg_type rt ON rt.oid=r.reltype WHERE rn.nspname='public'AND r.relname=ANY(${newTableArray})AND t.oid IN(r.reltype,rt.typarray)))
 THEN RAISE EXCEPTION 'UC018_UNDECLARED_ADDITIVE_CATALOG_OBJECT';END IF;
 IF(SELECT count(*)FROM pg_trigger t JOIN uc018_old_classes o ON o.oid=t.tgrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_triggers x WHERE x.oid=t.oid))<>0
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN uc018_old_classes o ON o.oid=t.tgrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_triggers x WHERE x.oid=t.oid)AND NOT(t.tgisinternal AND t.tgenabled='O'AND t.tgtype IN(9,17)AND o.nspname='public'AND EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN uc018_allowed_parent_fks f ON f.constraint_name=c.conname AND f.child_table=r.relname AND f.parent_table=o.relname JOIN pg_proc fn ON fn.oid=t.tgfoid JOIN pg_namespace fns ON fns.oid=fn.pronamespace WHERE c.oid=t.tgconstraint AND c.contype='f'AND c.confrelid=o.oid AND c.confupdtype='a'AND c.confdeltype='a'AND c.convalidated AND n.nspname='public'AND fns.nspname='pg_catalog'AND(t.tgtype=9 AND fn.proname='RI_FKey_noaction_del'OR t.tgtype=17 AND fn.proname='RI_FKey_noaction_upd'))))
 OR EXISTS(SELECT 1 FROM uc018_allowed_parent_fks f WHERE(SELECT count(*)FROM pg_trigger t JOIN uc018_old_classes o ON o.oid=t.tgrelid JOIN pg_constraint c ON c.oid=t.tgconstraint JOIN pg_class r ON r.oid=c.conrelid WHERE NOT EXISTS(SELECT 1 FROM uc018_old_triggers x WHERE x.oid=t.oid)AND c.conname=f.constraint_name AND r.relname=f.child_table AND o.relname=f.parent_table)<>2)
 THEN RAISE EXCEPTION 'UC018_UNDECLARED_OLD_TABLE_TRIGGER_ADDITION';END IF;
 -- No old-table trigger additions permitted; guarded count above must equal zero.

 FOREACH guard_new_table IN ARRAY ${newTableArray} LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',guard_new_table) INTO guard_new_rows;
  IF guard_new_rows THEN RAISE EXCEPTION 'UC018_NEW_TABLE_NOT_EMPTY: %',guard_new_table;END IF;
 END LOOP;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)VALUES(${quote(version)},'uc_document_registry',ARRAY[${quote(raw)}],NULL,NULL,NULL);
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations)<>620
 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${quote(version)}AND name='uc_document_registry'AND cardinality(statements)=1 AND md5(statements[1])=md5(${quote(raw)})AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL)
 OR(SELECT encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),''ORDER BY m.version COLLATE "C"),''),'UTF8')),'hex')FROM supabase_migrations.schema_migrations m WHERE version<>${quote(version)})IS DISTINCT FROM guard_before->>'ledger_sha256'
 THEN RAISE EXCEPTION 'UC018_EXACT_LEDGER_MISMATCH';END IF;
END $post$;
SELECT jsonb_build_object('status','PASS','kind','UC018_ATOMIC620_PRESERVATION','migration',${quote(version)},'raw_sha256',${quote(sha(raw))},'ledger_before',619,'ledger_inside',620,'old_public_table_sets',339,'old_auth_storage_public_table_sets',(SELECT count(*)FROM jsonb_object_keys((SELECT value->'data'FROM uc018_guard_before))),'all_old_rows_metadata_acl_roles_and_ledger_preserved',true,'allowed_body_changes',(SELECT jsonb_agg(jsonb_build_object('signature',a.signature,'old_md5',a.old_md5,'new_md5',a.new_md5)ORDER BY a.signature)FROM uc018_body_allowlist a),'data_digest',(SELECT encode(sha256(convert_to((value->'data')::text,'UTF8')),'hex')FROM uc018_guard_before),'preservation_before',(SELECT value-'data'FROM uc018_guard_before))AS uc018_release;
`;
await fs.mkdir(outputDir,{recursive:true});
const body = prefix+raw+suffix;
const rehearsal = body+'\nROLLBACK;\n';
const commit = body+'\nCOMMIT;\n';
if (rehearsal.replace(/ROLLBACK;\n$/,'COMMIT;\n')!==commit) throw new Error('Terminal-only equivalence failure');
await fs.writeFile(path.join(outputDir,'rehearsal.sql'),rehearsal,{flag:'wx'});
await fs.writeFile(path.join(outputDir,'commit.sql'),commit,{flag:'wx'});
const hold={kind:'SOURCE_ONLY_NOT_EXECUTION',at:new Date().toISOString(),migrationFile,configFile,sourceSHA256:sha(await fs.readFile(new URL(import.meta.url))),rawSHA256:sha(raw),rawMD5:crypto.createHash('md5').update(raw).digest('hex'),configSHA256:sha(await fs.readFile(configFile)),rehearsalSHA256:sha(rehearsal),commitSHA256:sha(commit),terminalOnlyDifference:true,expectedOldTableSets:374,expectedOldPublicTables:339,portableCatalogSQLSHA256:sha(catalogRaw),nativeMetadataSHA256:config.nativeMetadataSHA256,productionPolicyPreImageSHA256:config.productionPolicyPreImageSHA256,newPolicyQualMD5:config.newPolicyQualMD5,oldBodies,newBodyMD5:config.newBodyMD5,newTables,newFunctions:config.newFunctions,nativeParentFKTriggers:config.nativeParentFKTriggers,ledgerBefore:619,ledgerInside:620};
await fs.writeFile(path.join(outputDir,'SOURCE_HOLD.json'),JSON.stringify(hold,null,2),{flag:'wx'});
return hold;
}

