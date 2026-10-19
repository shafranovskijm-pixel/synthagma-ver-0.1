import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async p=>norm(await readFile(new URL(p,root),'utf8'));
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const file='20261019115000_uc_admission_cases.sql',source=await read('supabase/migrations/'+file);
if(/^BEGIN(?: ISOLATION.*)?;$/m.test(source)||/^COMMIT;$/m.test(source))throw Error('Migration must have no outer transaction');
const migration={file,version:file.slice(0,14),name:file.slice(15,-4),sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(source,'md5')};
const previousFolder='docs/releases/sintagma-production/uc-identification-private-review-20261019/';
const previous=JSON.parse(await read(previousFolder+'manifest.json'));
const prior=[...previous.priorMigrations,...previous.migrations];
if(prior.length!==15)throw Error('Expected exact100-114 prerequisite');
for(const m of prior)if(hash(await read('supabase/migrations/'+m.file),'md5')!==m.sourceMd5)throw Error('Changed prerequisite source '+m.version);
const preserved=[...new Set([...previous.preservedTables,...previous.expectedTables.map(t=>'public.'+t.table)])];
if(preserved.length!==71)throw Error('Expected71 preserved prior relations');
const tables=['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests'];
const functions=[...source.matchAll(/^CREATE FUNCTION public[.]([a-z_]+)[(]/gm)].map(m=>m[1]);
const changed=['account_deletion_snapshot','account_deletion_storage_write_guard','account_deletion_files','account_deletion_personal_row_counts','account_deletion_erase_data'];
const baselinePath='supabase/tests/fixtures/uc-admission-cases-baseline.json';
const baseline=JSON.parse(await read(baselinePath));
const dependencies=baseline.metadata.functions.map(f=>({signature:'public.'+f.signature,definition_md5:f.md5}));
if(dependencies.length!==15)throw Error('Expected15 captured authority/erasure dependencies');
const sourceAnchorsPath='docs/releases/sintagma-production/uc-admission-cases-20261019/reviewed-source-anchors.json';
const anchors=JSON.parse(await read(sourceAnchorsPath));
if(anchors.status!=='FROZEN_WITH_SQL_SOURCE'||anchors.fiveOnly.length!==5||anchors.migrationCanonicalLfSha256!==migration.sourceSha256)throw Error('Freeze reviewed five-body anchors only after SQL source freeze');
const reviewedChanges=anchors.fiveOnly.map(p=>{
 const before=baseline.metadata.functions.find(f=>f.signature===p.signature);
 if(!before||before.md5!==p.beforeMd5||hash(before.definition,'md5')!==p.beforeMd5)throw Error('Unreviewed prior body '+p.signature);
 let definition=before.definition;
 for(const a of p.anchors){if(definition.split(a.needle).length!==2)throw Error('Exact source anchor count '+p.signature);definition=definition.replace(a.needle,a.replacement);}
 return{signature:p.signature,before_definition_md5:p.beforeMd5,definition_md5:hash(definition,'md5')};
});
const ledger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
// PG17/18 semantic parity: attnotnull is retained; only redundant PG18
// pg_constraint NOT NULL rows are omitted from the portable fingerprint.
const tableShape=t=>`SELECT md5(jsonb_build_object(
 'owner_acl',(SELECT jsonb_build_array(pg_get_userbyid(relowner),relacl::text) FROM pg_class WHERE oid='public.${t}'::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attacl) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${t}'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='${t}'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='${t}'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.${t}'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.${t}'::regclass))::text) hash`;
// Preserve old relation structure and grants independently from intentional new
// triggers/policies, which have their own old-only and exact-new witnesses.
// This compares metadata inside one database; type/collation/owner OIDs never
// cross environments. attnotnull keeps NOT NULL semantics on PG17 and PG18.
const preservedShape=`SELECT md5(jsonb_build_object(
 'relation',(SELECT jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity,relkind,relpersistence,reloptions,relreplident,relispartition,relam,reltablespace) FROM pg_catalog.pg_class WHERE oid=t::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated,a.attcollation,a.attacl,a.attstorage,a.attcompression,a.attoptions,a.attfdwoptions) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,contype,condeferrable,condeferred,convalidated,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_catalog.pg_constraint WHERE conrelid=t::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexrelid::regclass::text,pg_get_indexdef(indexrelid),indisunique,indisprimary,indisexclusion,indimmediate,indisclustered,indisvalid,indisready,indislive,indisreplident) ORDER BY indexrelid::regclass::text) FROM pg_catalog.pg_index WHERE indrelid=t::regclass))::text)`;
const server=await createServer({root:fileURLToPath(root),configFile:false,logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
let db,expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers;
try{
 const fixture=await server.ssrLoadModule('/supabase/functions/_shared/uc-admission-cases.fixture.ts');
 db=await fixture.createUcAdmissionFixture(false);
 await db.exec(source);
 expectedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_userbyid(p.proowner) owner_name,p.proacl::text acl,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)}) ORDER BY 1`)).rows;
 expectedChangedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(changed)}) ORDER BY 1`)).rows;
 expectedTables=[];for(const t of tables)expectedTables.push({table:t,schemaMd5:(await db.query(tableShape(t))).rows[0].hash});
 expectedPolicies=(await db.query("SELECT schemaname,tablename,policyname,md5(to_jsonb(p)::text) definition_md5 FROM pg_policies p WHERE schemaname IN('public','storage') AND policyname LIKE 'uc_admission_%' ORDER BY schemaname,tablename,policyname")).rows;
 expectedTriggers=(await db.query("SELECT n.nspname schema_name,c.relname table_name,t.tgname name,md5(pg_get_triggerdef(t.oid)) definition_md5,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal AND t.tgfoid IN(SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname IN("+list(functions)+")) ORDER BY 1,2,3")).rows;
}finally{await db?.close();await server.close();}
if(expectedFunctions.length!==functions.length||expectedChangedFunctions.length!==5||expectedPolicies.length!==6||expectedTables.length!==6)throw Error('Missing expected private admission boundaries');
for(const reviewed of reviewedChanges){const actual=expectedChangedFunctions.find(f=>f.signature===reviewed.signature);if(!actual||actual.definition_md5!==reviewed.definition_md5)throw Error('Nonexact reviewed body transformation '+reviewed.signature);}
const strip=sql=>sql.trim().replace(/;$/,'');
const previousPostcheck=strip(await read(previousFolder+'postcheck.sql'));
let previousCompatiblePostcheck=previousPostcheck;
for(const reviewed of reviewedChanges){
 if(!previousCompatiblePostcheck.includes(reviewed.before_definition_md5))throw Error('Historical five-body attestation anchor missing '+reviewed.signature);
 previousCompatiblePostcheck=previousCompatiblePostcheck.replaceAll(reviewed.before_definition_md5,reviewed.definition_md5);
}

const exactFunctions=fs=>fs.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ');
const preflight=`-- Read-only: exact installed100-114 ledger, prior postcheck and captured authority/erasure bodies.
SELECT
 (SELECT count(*)=15 FROM supabase_migrations.schema_migrations WHERE ${ledger(prior)}) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${migration.version}') AS migration_absent,
 ${tables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')} AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)})) AS new_functions_absent,
 ${dependencies.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_authority_and_erasure_dependencies,
 NOT EXISTS(SELECT 1 FROM (${previousPostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release;
`;
const postcheck=`-- Repeatable metadata-only acceptance; does not inspect personal rows.
SELECT
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE ${ledger([migration])}) AS exact_admission_case_ledger,
 ${exactFunctions(expectedFunctions)} AS exact_new_functions,
 ${exactFunctions(expectedChangedFunctions)} AS exact_reviewed_five_erasure_bodies,
 ${dependencies.filter(f=>!changed.some(name=>f.signature.startsWith('public.'+name+'('))).map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_unchanged_authority_dependencies,
 ${expectedTables.map(t=>`(${tableShape(t.table)})='${t.schemaMd5}'`).join(' AND ')} AS exact_new_schema,
 ${tables.map(t=>['authenticated','anon','service_role'].map(r=>`NOT has_table_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE')`).join(' AND ')).join(' AND ')} AS private_rpc_state,
 ${expectedFunctions.map(f=>['authenticated','anon','service_role'].map(role=>`has_function_privilege('${role}','public.${f.signature}','EXECUTE')=${f[role]}`).join(' AND ')).join(' AND ')} AS exact_function_grants,
 ${expectedFunctions.map(f=>`EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.${f.signature}'::regprocedure AND pg_get_userbyid(p.proowner)=${quote(f.owner_name)} AND p.proacl::text IS NOT DISTINCT FROM ${f.acl===null?'NULL':quote(f.acl)})`).join(' AND ')} AS exact_new_function_owners_and_acls,
 ${expectedPolicies.map(p=>`EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='${p.schemaname}' AND tablename='${p.tablename}' AND policyname='${p.policyname}' AND md5(to_jsonb(p)::text)='${p.definition_md5}')`).join(' AND ')} AS exact_private_evidence_storage_boundaries,
 ${expectedTriggers.map(t=>`EXISTS(SELECT 1 FROM pg_trigger t WHERE tgrelid='${t.schema_name}.${t.table_name}'::regclass AND tgname='${t.name}' AND tgenabled='${t.enabled}' AND md5(pg_get_triggerdef(t.oid))='${t.definition_md5}')`).join(' AND ')} AS exact_case_history_storage_and_org_triggers,
 NOT EXISTS(SELECT 1 FROM (${previousCompatiblePostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release_compatible,
 EXISTS(SELECT 1 FROM storage.buckets WHERE id='admission-case-evidence' AND name='admission-case-evidence' AND public=false AND file_size_limit=20971520 AND allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png']) AS exact_private_evidence_bucket;
`;
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${strip(sql)}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
const batch=`-- Generated UC admission cases security. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC admission cases preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_admission_before(table_name text PRIMARY KEY,row_count bigint,row_hash text,metadata_hash text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE uc_admission_relations_before ON COMMIT DROP AS SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND c.relkind IN('r','p','v','m','S','f');
CREATE TEMP TABLE uc_admission_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_admission_functions_before ON COMMIT DROP AS SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_admission_triggers_before ON COMMIT DROP AS SELECT t.oid,t.tgenabled,md5(pg_get_triggerdef(t.oid)) hash FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal;
CREATE TEMP TABLE uc_admission_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;shape text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r%s',t,CASE WHEN t='storage.buckets' THEN ' WHERE id<>''admission-case-evidence''' ELSE '' END) INTO n,h;
 ${preservedShape} INTO shape;
 INSERT INTO uc_admission_before VALUES(t,n,h,shape);END LOOP;END $snapshot$;
DO $migration$ DECLARE source text:=$source_115$${source}$source_115$;BEGIN
 IF md5(source)<>'${migration.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch ${migration.version}';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${migration.version}','${migration.name}',ARRAY[source]);
END $migration$;
${assert(postcheck,'UC admission cases postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;t text;shape text;BEGIN
 FOR r IN SELECT * FROM uc_admission_before LOOP
 t:=r.table_name;${preservedShape} INTO shape;
 IF shape IS DISTINCT FROM r.metadata_hash THEN RAISE EXCEPTION 'Historical relation metadata changed in %',r.table_name;END IF;
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x%s',r.table_name,CASE WHEN r.table_name='storage.buckets' THEN ' WHERE id<>''admission-case-evidence''' ELSE '' END) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN uc_admission_relations_before b ON b.oid=c.oid WHERE n.nspname IN('public','storage') AND c.relkind IN('r','p','v','m','S','f') AND b.oid IS NULL AND NOT(n.nspname='public' AND c.relname IN(${list(tables)}))) THEN RAISE EXCEPTION 'Unreviewed additional relation';END IF;
 IF EXISTS(SELECT 1 FROM uc_admission_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies p LEFT JOIN uc_admission_policies_before b USING(schemaname,tablename,policyname) WHERE p.schemaname IN('public','storage') AND b.policyname IS NULL AND NOT(${expectedPolicies.map(p=>`(p.schemaname='${p.schemaname}' AND p.tablename='${p.tablename}' AND p.policyname='${p.policyname}')`).join(' OR ')})) THEN RAISE EXCEPTION 'Unreviewed additional policy';END IF;
 IF EXISTS(SELECT 1 FROM uc_admission_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl OR(b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid)) AND NOT(${expectedChangedFunctions.map(f=>`(p.oid='public.${f.signature}'::regprocedure AND md5(pg_get_functiondef(p.oid))='${f.definition_md5}')`).join(' OR ')}))) THEN RAISE EXCEPTION 'Unreviewed existing function or ACL changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN uc_admission_functions_before b ON b.oid=p.oid WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p') AND b.oid IS NULL AND p.oid NOT IN(${expectedFunctions.map(f=>`'public.${f.signature}'::regprocedure`).join(',')})) THEN RAISE EXCEPTION 'Unreviewed additional function';END IF;
 IF EXISTS(SELECT 1 FROM uc_admission_triggers_before b LEFT JOIN pg_trigger t ON t.oid=b.oid WHERE b.hash IS DISTINCT FROM md5(pg_get_triggerdef(t.oid)) OR b.tgenabled IS DISTINCT FROM t.tgenabled) THEN RAISE EXCEPTION 'Existing trigger changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN uc_admission_triggers_before b ON b.oid=t.oid WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal AND b.oid IS NULL AND NOT(${expectedTriggers.map(t=>`(n.nspname='${t.schema_name}' AND c.relname='${t.table_name}' AND t.tgname='${t.name}')`).join(' OR ')})) THEN RAISE EXCEPTION 'Unreviewed additional trigger';END IF;
 IF EXISTS(SELECT 1 FROM uc_admission_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF ${tables.map(t=>`EXISTS(SELECT 1 FROM public.${t})`).join(' OR ')} THEN RAISE EXCEPTION 'Unexpected prospective admission backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
for(const [name,value] of [['preflight.sql',preflight],['postcheck.sql',postcheck],['production-batch.sql',batch]])await writeFile(new URL(name,folder),value);
const productFiles=[
  {
    "path": "src/components/organization/student-detail/AdmissionCaseCard.tsx",
    "sourceSha256": "5ff27eb0ad39c7ad3bf9238ceeba78000ba9a1b1f4d00342ca30fc30ae18d64b",
    "kind": "frontend_source"
  },
  {
    "path": "src/components/organization/student-detail/AdmissionEvidenceSection.tsx",
    "sourceSha256": "ada61a2c8f71971a11f95a57246ac70760d9144e50308238801506d1c4a7578b",
    "kind": "frontend_source"
  },
  {
    "path": "src/components/organization/tabs/StudentDetailsTab.tsx",
    "sourceSha256": "141475bffacd148f77b0e64fff935b01d00d48358fcede34d1e5ae77341fcc19",
    "kind": "frontend_source"
  },
  {
    "path": "src/components/student/StudentDocumentsTab.tsx",
    "sourceSha256": "2a43602f9676dcc0bc861a9e49dd5eabdabdf781a853e3e91d15cd021f173aa7",
    "kind": "frontend_source"
  },
  {
    "path": "src/hooks/useAdmissionCase.ts",
    "sourceSha256": "7e586f411d1cc433129b0f3694146a93414ceb9745d59708e4410f065f93d8c5",
    "kind": "frontend_source"
  },
  {
    "path": "src/lib/admissionCases/client.ts",
    "sourceSha256": "98d1c320c5bd264d267ff4b61d7a6c7c0f87385a91d7f4423b6899928782dd0c",
    "kind": "frontend_source"
  },
  {
    "path": "src/lib/admissionCases/contract.ts",
    "sourceSha256": "3df89ca4271bf0c674dfcdf36e9b1177cfb36a82a16d6bd5e472b328549b6cc4",
    "kind": "frontend_source"
  },
  {
    "path": "supabase/config.toml",
    "sourceSha256": "c25f4a9d69c162a7b68b24fd188b6bfe1f76759bd94d5b870004a48fe47589a2",
    "kind": "root_configuration"
  },
  {
    "path": "supabase/functions/_shared/admission-case-access.ts",
    "sourceSha256": "f647c10055d22f649faa3966fea8c20fb225eff9f4cb61e2a91c53495a434bf5",
    "kind": "native_edge_ts"
  },
  {
    "path": "supabase/functions/_shared/admission-case-evidence-commit.ts",
    "sourceSha256": "392747efc1c9e745f0a5f3f0c6b1da517b8dd0fcbeca2bd2fec6edfae32980bd",
    "kind": "native_edge_ts"
  },
  {
    "path": "supabase/functions/_shared/admission-case-evidence-file.ts",
    "sourceSha256": "da7be818f9a0c013735b56620496acafb7dfa8807a9ecd6c0eeb750a38fdbd9f",
    "kind": "native_edge_ts"
  },
  {
    "path": "supabase/functions/admission-case-evidence-commit/index.ts",
    "sourceSha256": "aa064d04d08a012144738b8962c6fb4eeed79ec9052c02e9445bcb066befa089",
    "kind": "native_edge_ts"
  },
  {
    "path": "supabase/functions/admission-case-evidence-file/index.ts",
    "sourceSha256": "5e31af0e1542ea146f30e0a0cdd9b62da99539b6a40e0c32129259f1761de306",
    "kind": "native_edge_ts"
  }
];
for(const f of productFiles)if(hash(await read(f.path))!==f.sourceSha256)throw Error('Frozen runtime/source drift '+f.path);
const runtimePaths=new Set(productFiles.filter(f=>f.kind==='native_edge_ts').map(f=>f.path));
await writeFile(new URL('manifest.json',folder),JSON.stringify({release:'uc-admission-cases-20261019',preparedOnly:true,migrationCount:1,
 batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only; executable and ledger store canonical LF source',migrations:[migration],
 priorMigrations:prior.map(({file,version,name,sourceMd5})=>({file,version,name,sourceMd5})),
 previousReleaseManifest:{path:previousFolder+'manifest.json',sourceSha256:hash(await read(previousFolder+'manifest.json'))},
 preservedTables:preserved,dependencies,unchangedPriorFunctionBodiesExceptReviewed:expectedChangedFunctions.map(f=>f.signature), previousReleaseCompatibility:{rule:'Only exact five reviewed account-function definition pins are substituted in the nested114 postcheck. Every historical SQL/manifest remains unchanged.',reviewedChanges},sourceAnchors:{path:sourceAnchorsPath,sourceSha256:hash(await read(sourceAnchorsPath))},baselineCapture:{path:baselinePath,sourceSha256:hash(await read(baselinePath))},expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,productFiles,
 edgeFunctions:['admission-case-evidence-commit','admission-case-evidence-file'],configSemanticAttestation:{path:'supabase/config.toml',verifyJwtFalse:['admission-case-evidence-commit','admission-case-evidence-file'],originalCallerValidation:'Both fixed entrypoints call original auth.getUser before exact SQL authority; service transport never decides admission.'},edgeRuntimeGraph:[...runtimePaths].sort(),deploymentOrder:[
 'Read-only preflight: exact100-114 ledger, previous postcheck and15 captured authority/erasure definitions',
 'Submit entire115 transaction once; require every postcheck flag true and preservation guards passed',
 'After SQL acceptance, root deploys the two named evidence commit/file Edge functions and compatible frontend; no legacy backfill, learning/issuer/contract changes or legal decisions',
 'Root-owned isolated synthetic acceptance only; no real-person admission, law activation, PEP, SMTP, official issuance, deletion or backfill during release']},null,2)+'\n');
console.log('Prepared portable single115 atomic release; no deployment performed.');
