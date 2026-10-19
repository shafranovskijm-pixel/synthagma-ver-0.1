import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
import {createServer} from 'vite';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async p=>norm(await readFile(new URL(p,root),'utf8'));
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const file='20261019114000_uc_identification_private_review.sql',source=await read('supabase/migrations/'+file);
if(/^BEGIN(?: ISOLATION.*)?;$/m.test(source)||/^COMMIT;$/m.test(source))throw Error('Migration must have no outer transaction');
const migration={file,version:file.slice(0,14),name:file.slice(15,-4),sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(source,'md5')};
const previousFolder='docs/releases/sintagma-production/uc-enrollment-delete-20261019/';
const previous=JSON.parse(await read(previousFolder+'release-manifest.json'));
const prior=[...previous.priorMigrations,...previous.migrations];
if(prior.length!==14)throw Error('Expected exact100-113 prerequisite');
for(const m of prior)if(hash(await read('supabase/migrations/'+m.file),'md5')!==m.sourceMd5)throw Error('Changed prerequisite source '+m.version);
const preserved=[...new Set([...previous.preservedTables,...previous.expectedTables.map(t=>'public.'+t.table),'public.video_identifications'])];
const tables=['uc_identification_records','uc_identification_sources','uc_identification_events','uc_identification_requests','uc_identification_write_contexts'];
const functions=[...source.matchAll(/^CREATE FUNCTION public[.]([a-z_]+)[(]/gm)].map(m=>m[1]);
const changed=['save_student_registration_details','account_deletion_storage_write_guard','account_deletion_files','account_deletion_personal_row_counts','account_deletion_erase_data'];
const sourceDependencies=[...source.matchAll(/'(public[.][^']+[(][^']*[)])','([a-f0-9]{32})'/g)].map(m=>({signature:m[1],definition_md5:m[2]}));
const dependencies=[...new Map(sourceDependencies.map(f=>[f.signature,f])).values()];
const ledger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
// PG17/18 semantic parity: attnotnull is retained; only redundant PG18
// pg_constraint NOT NULL rows are omitted from the portable fingerprint.
const tableShape=t=>`SELECT md5(jsonb_build_object(
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
let db,expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,oldVideoPolicies;
try{
 const fixture=await server.ssrLoadModule('/supabase/functions/_shared/uc-identification-private-review.fixture.ts');
 db=await fixture.createUcIdentificationFixture(false);
 oldVideoPolicies=(await db.query("SELECT policyname,md5(to_jsonb(p)::text) definition_md5 FROM pg_policies p WHERE schemaname='public' AND tablename='video_identifications' ORDER BY policyname")).rows;
 await db.exec(source);
 expectedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)}) ORDER BY 1`)).rows;
 expectedChangedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(changed)}) ORDER BY 1`)).rows;
 expectedTables=[];for(const t of tables)expectedTables.push({table:t,schemaMd5:(await db.query(tableShape(t))).rows[0].hash});
 expectedPolicies=(await db.query("SELECT schemaname,tablename,policyname,md5(to_jsonb(p)::text) definition_md5 FROM pg_policies p WHERE schemaname IN('public','storage') AND policyname LIKE 'uc_identification_%' ORDER BY schemaname,tablename,policyname")).rows;
 expectedTriggers=(await db.query("SELECT n.nspname schema_name,c.relname table_name,t.tgname name,md5(pg_get_triggerdef(t.oid)) definition_md5,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgfoid IN(SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname IN("+list(functions)+")) ORDER BY 1,2,3")).rows;
}finally{await db?.close();await server.close();}
if(expectedFunctions.length!==functions.length||expectedChangedFunctions.length!==5||expectedPolicies.length!==12||oldVideoPolicies.length!==7)throw Error('Missing expected private identification boundaries');
const strip=sql=>sql.trim().replace(/;$/,'');
const previousPostcheck=strip(await read(previousFolder+'postcheck.sql'));
const registration=expectedChangedFunctions.find(f=>f.signature==='save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)');
const previousCompatiblePostcheck=previousPostcheck.replaceAll('ef4299140c264616b0854e95fea0af2a',registration.definition_md5);
if(previousCompatiblePostcheck===previousPostcheck)throw Error('Historical registration attestation anchor missing');

const exactFunctions=fs=>fs.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ');
const preflight=`-- Read-only: exact installed100-112 ledger, prior postcheck and captured authority/issuance bodies.
SELECT
 (SELECT count(*)=14 FROM supabase_migrations.schema_migrations WHERE ${ledger(prior)}) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${migration.version}') AS migration_absent,
 ${tables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')} AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)})) AS new_functions_absent,
 ${dependencies.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_access_and_issuance_dependencies,
 ${oldVideoPolicies.map(p=>`EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='public' AND tablename='video_identifications' AND policyname='${p.policyname}' AND md5(to_jsonb(p)::text)='${p.definition_md5}')`).join(' AND ')} AND(SELECT count(*)=7 FROM pg_policies WHERE schemaname='public' AND tablename='video_identifications') AS exact_legacy_video_policies,
 NOT EXISTS(SELECT 1 FROM (${previousPostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release;
`;
const postcheck=`-- Repeatable metadata-only acceptance; does not inspect personal rows.
SELECT
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE ${ledger([migration])}) AS exact_identification_private_review_ledger,
 ${exactFunctions(expectedFunctions)} AS exact_new_functions,
 ${exactFunctions(expectedChangedFunctions)} AS exact_reviewed_registration_erasure_bodies,
 ${dependencies.filter(f=>!changed.some(name=>f.signature.startsWith('public.'+name+'('))).map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_unchanged_authority_dependencies,
 ${expectedTables.map(t=>`(${tableShape(t.table)})='${t.schemaMd5}'`).join(' AND ')} AS exact_new_schema,
 ${tables.map(t=>['authenticated','anon','service_role'].map(r=>`NOT has_table_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege('${r}','public.${t}','SELECT,INSERT,UPDATE')`).join(' AND ')).join(' AND ')} AS private_rpc_state,
 ${expectedFunctions.map(f=>['authenticated','anon','service_role'].map(role=>`has_function_privilege('${role}','public.${f.signature}','EXECUTE')=${f[role]}`).join(' AND ')).join(' AND ')} AS exact_function_grants,
 ${expectedPolicies.map(p=>`EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='${p.schemaname}' AND tablename='${p.tablename}' AND policyname='${p.policyname}' AND md5(to_jsonb(p)::text)='${p.definition_md5}')`).join(' AND ')} AS exact_identification_and_legacy_upload_boundaries,
 ${expectedTriggers.map(t=>`EXISTS(SELECT 1 FROM pg_trigger t WHERE tgrelid='${t.schema_name}.${t.table_name}'::regclass AND tgname='${t.name}' AND tgenabled='${t.enabled}' AND md5(pg_get_triggerdef(t.oid))='${t.definition_md5}')`).join(' AND ')} AS exact_identification_projection_cascade_triggers,
 NOT EXISTS(SELECT 1 FROM (${previousCompatiblePostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release_compatible,
 EXISTS(SELECT 1 FROM storage.buckets WHERE id='student-identification-media' AND name='student-identification-media' AND public=false AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg']) AS exact_private_capture_bucket;
`;
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${strip(sql)}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
const batch=`-- Generated UC identification private review security. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC identification private review preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_identification_before(table_name text PRIMARY KEY,row_count bigint,row_hash text,metadata_hash text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE uc_identification_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_identification_functions_before ON COMMIT DROP AS SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_identification_triggers_before ON COMMIT DROP AS SELECT t.oid,t.tgenabled,md5(pg_get_triggerdef(t.oid)) hash FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal;
CREATE TEMP TABLE uc_identification_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;shape text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r%s',t,CASE WHEN t='storage.buckets' THEN ' WHERE id<>''student-identification-media''' ELSE '' END) INTO n,h;
 ${preservedShape} INTO shape;
 INSERT INTO uc_identification_before VALUES(t,n,h,shape);END LOOP;END $snapshot$;
DO $migration$ DECLARE source text:=$source_114$${source}$source_114$;BEGIN
 IF md5(source)<>'${migration.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch ${migration.version}';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${migration.version}','${migration.name}',ARRAY[source]);
END $migration$;
${assert(postcheck,'UC identification private review postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;t text;shape text;BEGIN
 FOR r IN SELECT * FROM uc_identification_before LOOP
 t:=r.table_name;${preservedShape} INTO shape;
 IF shape IS DISTINCT FROM r.metadata_hash THEN RAISE EXCEPTION 'Historical relation metadata changed in %',r.table_name;END IF;
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x%s',r.table_name,CASE WHEN r.table_name='storage.buckets' THEN ' WHERE id<>''student-identification-media''' ELSE '' END) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_identification_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies p LEFT JOIN uc_identification_policies_before b USING(schemaname,tablename,policyname) WHERE p.schemaname IN('public','storage') AND b.policyname IS NULL AND NOT(${expectedPolicies.map(p=>`(p.schemaname='${p.schemaname}' AND p.tablename='${p.tablename}' AND p.policyname='${p.policyname}')`).join(' OR ')})) THEN RAISE EXCEPTION 'Unreviewed additional policy';END IF;
 IF EXISTS(SELECT 1 FROM uc_identification_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl OR(b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid)) AND NOT(${expectedChangedFunctions.map(f=>`(p.oid='public.${f.signature}'::regprocedure AND md5(pg_get_functiondef(p.oid))='${f.definition_md5}')`).join(' OR ')}))) THEN RAISE EXCEPTION 'Unreviewed existing function or ACL changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN uc_identification_functions_before b ON b.oid=p.oid WHERE n.nspname IN('public','storage','auth') AND p.prokind IN('f','p') AND b.oid IS NULL AND p.oid NOT IN(${expectedFunctions.map(f=>`'public.${f.signature}'::regprocedure`).join(',')})) THEN RAISE EXCEPTION 'Unreviewed additional function';END IF;
 IF EXISTS(SELECT 1 FROM uc_identification_triggers_before b LEFT JOIN pg_trigger t ON t.oid=b.oid WHERE b.hash IS DISTINCT FROM md5(pg_get_triggerdef(t.oid)) OR b.tgenabled IS DISTINCT FROM t.tgenabled) THEN RAISE EXCEPTION 'Existing trigger changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN uc_identification_triggers_before b ON b.oid=t.oid WHERE n.nspname IN('public','storage') AND NOT t.tgisinternal AND b.oid IS NULL AND NOT(${expectedTriggers.map(t=>`(n.nspname='${t.schema_name}' AND c.relname='${t.table_name}' AND t.tgname='${t.name}')`).join(' OR ')})) THEN RAISE EXCEPTION 'Unreviewed additional trigger';END IF;
 IF EXISTS(SELECT 1 FROM uc_identification_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF ${tables.map(t=>`EXISTS(SELECT 1 FROM public.${t})`).join(' OR ')} THEN RAISE EXCEPTION 'Unexpected prospective identification backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
for(const [name,value] of [['preflight.sql',preflight],['postcheck.sql',postcheck],['production-batch.sql',batch]])await writeFile(new URL(name,folder),value);
const runtimePaths=new Set(),paths=[];
const productFiles=[];for(const path of paths.sort())productFiles.push({path,sourceSha256:hash(await read(path))});
await writeFile(new URL('manifest.json',folder),JSON.stringify({release:'uc-identification-private-review-20261019',preparedOnly:true,migrationCount:1,
 batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only; executable and ledger store canonical LF source',migrations:[migration],
 priorMigrations:prior.map(({file,version,name,sourceMd5})=>({file,version,name,sourceMd5})),
 previousReleaseManifest:{path:previousFolder+'release-manifest.json',sourceSha256:hash(await read(previousFolder+'release-manifest.json'))},
 preservedTables:preserved,dependencies,unchangedPriorFunctionBodiesExceptReviewed:expectedChangedFunctions.map(f=>f.signature), previousReleaseCompatibility:{rule:'Only nested previous113 postcheck registration body hash superseded by this reviewed114 body; all frozen historical release sources unchanged.',oldRegistrationDefinitionMd5:'ef4299140c264616b0854e95fea0af2a',newRegistrationDefinitionMd5:registration.definition_md5},expectedFunctions,expectedChangedFunctions,expectedTables,expectedPolicies,expectedTriggers,productFiles,
 edgeFunctions:[],edgeRuntimeGraph:[...runtimePaths].sort(),deploymentOrder:[
 'Read-only preflight: exact100-113 ledger, previous postcheck, authority and captured issuance definitions',
 'Submit entire114 transaction once; require every postcheck flag true and preservation guards passed',
 'After SQL acceptance, root deploys exactly two named private identification Edge functions then compatible frontend; no legacy migration or learning grants',
 'Root-owned rollback-only production QA then real browser acceptance; no PEP, SMTP, real issuance or backfill during release']},null,2)+'\n');
console.log('Prepared portable single114 atomic release; no deployment performed.');
