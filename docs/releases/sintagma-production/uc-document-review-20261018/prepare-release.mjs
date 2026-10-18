import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async p=>norm(await readFile(new URL(p,root),'utf8'));
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const file='20261018110000_uc_document_internal_review.sql',source=await read('supabase/migrations/'+file);
if(/^BEGIN(?: ISOLATION.*)?;$/m.test(source)||/^COMMIT;$/m.test(source))throw Error('Migration must have no outer transaction');
const migration={file,version:file.slice(0,14),name:file.slice(15,-4),sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(source,'md5')};
const previousFolder='docs/releases/sintagma-production/uc-education-profile-20261018/';
const previous=JSON.parse(await read(previousFolder+'release-manifest.json'));
const prior=[...previous.priorMigrations,...previous.migrations];
if(prior.length!==10)throw Error('Expected exact100-109 prerequisite');
for(const m of prior)if(hash(await read('supabase/migrations/'+m.file),'md5')!==m.sourceMd5)throw Error('Changed prerequisite source '+m.version);
const preserved=[...new Set([...previous.preservedTables,...previous.expectedTables.map(t=>'public.'+t.table),'public.org_document_write_tokens'])];
const tables=['org_document_reviews','org_document_review_comments','org_document_review_events','org_document_review_requests'];
const functions=[...source.matchAll(/^CREATE FUNCTION public[.]([a-z_]+)[(]/gm)].map(m=>m[1]);
if(functions.length!==15)throw Error('Unexpected110 function count '+functions.length);
const sourceDependencies=[...source.matchAll(/'(public[.][^']+[(][^']*[)])','([a-f0-9]{32})'/g)].map(m=>({signature:m[1],definition_md5:m[2]}));
const auth=JSON.parse(await read('supabase/tests/fixtures/uc-document-review-auth-baseline.json')).functions.map(f=>({...f,signature:'public.'+f.signature}));
const dependencies=[...new Map([...sourceDependencies,...auth].map(f=>[f.signature,{signature:f.signature,definition_md5:f.definition_md5}])).values()];
const immutableStorage=JSON.parse(await read('supabase/tests/fixtures/uc-document-review-storage-baseline.json')).rows.filter(r=>r.kind==='policy');
const ledger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
// PG17/18: NOT NULL remains fingerprinted through attnotnull; omit only
// PG18's redundant pg_constraint rows, not any semantic constraint.
const tableShape=t=>`SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${t}'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='${t}'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='${t}'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.${t}'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.${t}'::regclass))::text) hash`;
const server=await createServer({root:fileURLToPath(root),configFile:false,logLevel:'error',server:{middlewareMode:true},appType:'custom'});
let db,expectedFunctions,expectedTables;
try{
 const fixture=await server.ssrLoadModule('/supabase/functions/_shared/uc-document-review-release.fixture.ts');
 db=await fixture.createUcDocumentReviewReleaseFixture(true);
 expectedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)}) ORDER BY 1`)).rows;
 expectedTables=[];for(const t of tables)expectedTables.push({table:t,schemaMd5:(await db.query(tableShape(t))).rows[0].hash});
}finally{await db?.close();await server.close();}
if(expectedFunctions.length!==functions.length)throw Error('Missing expected function');
const strip=sql=>sql.trim().replace(/;$/,'');
const previousPostcheck=strip(await read(previousFolder+'postcheck.sql'));
const storageGuard=immutableStorage.map(p=>`EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='${p.identity}' AND md5(to_jsonb(p)::text)='${p.definition_md5}')`).join(' AND ');
const preflight=`-- Read-only; requires the exact installed100-109 ledger and prior postcheck.
SELECT
 (SELECT count(*)=10 FROM supabase_migrations.schema_migrations WHERE ${ledger(prior)}) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${migration.version}') AS migration_absent,
 ${tables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')} AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)})) AS new_functions_absent,
 ${dependencies.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_access_dependencies,
 ${storageGuard} AS exact_immutable_storage_boundary,
 NOT EXISTS(SELECT 1 FROM (${previousPostcheck}) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release;
`;
const postcheck=`-- Repeatable metadata-only acceptance; remains valid after real review records exist.
SELECT
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE ${ledger([migration])}) AS exact_review_ledger,
 ${expectedFunctions.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_new_functions,
 ${expectedTables.map(t=>`(${tableShape(t.table)})='${t.schemaMd5}'`).join(' AND ')} AS exact_new_schema,
 ${tables.slice(0,3).map(t=>`has_table_privilege('authenticated','public.${t}','SELECT') AND NOT has_table_privilege('authenticated','public.${t}','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.${t}','SELECT,INSERT,UPDATE,DELETE')`).join(' AND ')} AS rpc_only_writes,
 ${['authenticated','anon','service_role'].map(r=>`NOT has_table_privilege('${r}','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE')`).join(' AND ')} AS private_request_receipts,
 ${expectedFunctions.map(f=>['authenticated','anon','service_role'].map(role=>`has_function_privilege('${role}','public.${f.signature}','EXECUTE')=${f[role]}`).join(' AND ')).join(' AND ')} AS exact_function_grants,
 ${storageGuard} AS exact_immutable_storage_boundary;
`;
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${strip(sql)}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
const batch=`-- Generated UC010 internal review. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC review preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_review_before(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_review_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_review_functions_before ON COMMIT DROP AS
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_review_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r',t) INTO n,h;
 INSERT INTO uc_review_before VALUES(t,n,h);END LOOP;END $snapshot$;
DO $migration$ DECLARE source text:=$source_110$${source}$source_110$;BEGIN
 IF md5(source)<>'${migration.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch ${migration.version}';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${migration.version}','${migration.name}',ARRAY[source]);
END $migration$;
${assert(postcheck,'UC review postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_review_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x',r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_review_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_review_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid)) OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl) THEN RAISE EXCEPTION 'Existing function changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_review_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF ${tables.map(t=>`EXISTS(SELECT 1 FROM public.${t})`).join(' OR ')} THEN RAISE EXCEPTION 'Unexpected internal review backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
for(const [name,value] of [['preflight.sql',preflight],['postcheck.sql',postcheck],['release-transaction.sql',batch]])await writeFile(new URL(name,folder),value);
const paths=['src/lib/orgDocumentWorkflow.ts','src/lib/orgDocumentReviewContent.ts','src/hooks/useOrgDocumentWorkflow.ts',
 'src/hooks/useOrgDocumentVersions.ts','src/components/organization/documents/OrgDocumentWorkflowPanel.tsx',
 'src/components/organization/OrgDocumentVersionsDialog.tsx','src/components/signing/ReviewableDocument.tsx'];
const frontendFiles=[];for(const path of paths.sort())frontendFiles.push({path,sourceSha256:hash(await read(path))});
await writeFile(new URL('release-manifest.json',folder),JSON.stringify({release:'uc-document-review-20261018',preparedOnly:true,migrationCount:1,
 batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only; executable and ledger store canonical LF source',
 migrations:[migration],priorMigrations:prior.map(({file,version,name,sourceMd5})=>({file,version,name,sourceMd5})),
 previousReleaseManifest:{path:previousFolder+'release-manifest.json',sourceSha256:hash(await read(previousFolder+'release-manifest.json'))},
 preservedTables:preserved,dependencies,immutableStorage,expectedFunctions,expectedTables,frontendFiles,edgeFunctions:[],
 deploymentOrder:['Read-only preflight: exact100-109 installed including previous release postcheck','Submit entire single110 transaction once','All postcheck fields true; existing rows/functions/policies/cron preserved','Companion UI deploy; internal review is separate from PEP/signatures and issuance','Use prepared rollback-only QA acceptance, then parent-owned browser acceptance']},null,2)+'\n');
console.log('Prepared portable single110 atomic release; no deployment performed.');
