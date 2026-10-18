import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async p=>norm(await readFile(new URL(p,root),'utf8'));
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const migrations=[];
for(const file of ['20261018108000_uc_education_compliance_profile.sql','20261018109000_uc_signature_token_files.sql']){
 const source=await read('supabase/migrations/'+file),version=file.slice(0,14),name=file.slice(15,-4);
 if(/^BEGIN(?: ISOLATION.*)?;$/m.test(source)||/^COMMIT;$/m.test(source))throw Error('Migrations must have no outer transaction');
 migrations.push({file,version,name,source,sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(source,'md5')});
}
const versions=migrations.map(m=>m.version);
const replacements=['uc_document_storage_scope','uc_signature_storage_read','uc_signature_storage_write','add_signature_revision'];
const fileBaseline=JSON.parse(await read('supabase/tests/fixtures/uc-signature-files-baseline.json')).functions;
const replacementSignatures=['uc_document_storage_scope(text,text)','uc_signature_storage_read(text,text)','uc_signature_storage_write(text,text)','add_signature_revision(uuid,text,text,text,text,text)'];
const foundation=JSON.parse(await read('docs/releases/sintagma-production/uc-document-foundation-20261018/release-manifest.json'));
const stage2=JSON.parse(await read('docs/releases/sintagma-production/uc-document-scope-20261018/release-manifest.json'));
const prior=[...foundation.migrations,...stage2.migrations];
const preserved=[...new Set([...stage2.preservedTables,'public.org_staff_document_groups','public.org_staff_document_scopes','public.org_staff_document_scope_events','public.uc_goreltech_document_stages'])];
const profileTables=['organization_education_profiles','organization_education_profile_history','organization_document_applicability_decisions','organization_document_applicability_history'];
const tables=[...profileTables,'uc_signature_file_requests'];
const functions=['uc_empty_education_profile','uc_validate_education_profile','uc_guard_compliance_history','uc_validate_applicability_key',
 'get_organization_education_profile','save_organization_education_profile','list_organization_education_profile_history',
 'list_organization_document_applicability_decisions','save_organization_document_applicability_decision','list_organization_document_applicability_history',
 'uc_signature_locator_key','uc_signature_canonical_file','uc_signature_object_uploader','uc_signature_object_bound','uc_signature_file_scope',
 'uc_guard_signature_file_provenance','create_external_contract_signature_v2','add_signature_revision_v2','uc_signature_file_context'];
const auth=[...JSON.parse(await read('supabase/tests/fixtures/uc-education-profile-baseline.json')).functions,...JSON.parse(await read('supabase/tests/fixtures/uc-education-profile-auth-baseline.json')).functions,...JSON.parse(await read('supabase/tests/fixtures/uc-signature-file-token-baseline-20261018.json')).functions];
const ledger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
// PG18 exposes NOT NULL in pg_constraint; PG17 does not. attnotnull below
// remains authoritative, so only that duplicated representation is omitted.
const tableShape=(t)=>`SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${t}'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.${t}'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='${t}'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='${t}'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.${t}'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass))::text) hash`;
const server=await createServer({root:fileURLToPath(root),configFile:false,logLevel:'error',server:{middlewareMode:true},appType:'custom'});
let db,expectedFunctions,expectedTables,expectedTriggers,expectedStoragePolicies;
try{
 const fixture=await server.ssrLoadModule('/supabase/functions/_shared/uc-signature-files.fixture.ts');
 db=await fixture.createUcSignatureFilesFixture();
 expectedFunctions=(await db.query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('service_role',p.oid,'EXECUTE') service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list([...functions,...replacements])}) ORDER BY 1`)).rows;
 expectedTables=[];for(const t of tables)expectedTables.push({table:t,schemaMd5:(await db.query(tableShape(t))).rows[0].hash});
 expectedTriggers=(await db.query("SELECT tgname name,tgrelid::regclass::text table_name,md5(pg_get_triggerdef(oid)) definition_md5 FROM pg_trigger WHERE tgname IN('uc_signature_file_provenance','uc_revision_file_provenance') ORDER BY 1")).rows;
 expectedStoragePolicies=(await db.query("SELECT policyname name,md5(to_jsonb(p)::text) definition_md5 FROM pg_policies p WHERE schemaname='storage' AND policyname LIKE 'uc_signature_namespace_%' ORDER BY 1")).rows;
}finally{await db?.close();await server.close();}
if(expectedFunctions.length!==23||expectedTriggers.length!==2||expectedStoragePolicies.length!==3)throw Error('Unexpected signature/profile artifact count');
const preflight=`-- Read-only deployment preflight; no personal data or scheduled credentials returned.
SELECT
 (SELECT count(*)=8 FROM supabase_migrations.schema_migrations WHERE ${ledger(prior)}) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN(${list(versions)})) AS migration_absent,
 ${tables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')} AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${list(functions)})) AS new_functions_absent,
 ${auth.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_access_dependencies,
 ${fileBaseline.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.proname}(${f.args.split(',').map(a=>a.trim().split(' ').at(-1)).join(',')})')))='${f.md5}',false)`).join(' AND ')} AS exact_file_dependencies,
 (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND ((column_name='owner' AND data_type='uuid') OR (column_name='owner_id' AND data_type='text'))) AS storage_uploader_schema,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=2 FROM storage.buckets WHERE id IN('external-contracts','signed-documents') AND NOT public) AS signature_buckets_private;
`;
const rpcSignatures=expectedFunctions.filter(f=>/^(get_|save_|list_)/.test(f.signature));
const postcheck=`-- Repeatable read-only acceptance: valid after real profiles have been saved too.
SELECT
 (SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE ${ledger(migrations)}) AS exact_profile_ledger,
 ${expectedFunctions.map(f=>`coalesce(md5(pg_get_functiondef(to_regprocedure('public.${f.signature}')))='${f.definition_md5}',false)`).join(' AND ')} AS exact_new_functions,
 ${expectedTables.map(t=>`(${tableShape(t.table)})='${t.schemaMd5}'`).join(' AND ')} AS exact_new_schema,
 ${profileTables.map(t=>`has_table_privilege('authenticated','public.${t}','SELECT') AND NOT has_table_privilege('authenticated','public.${t}','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.${t}','INSERT,UPDATE,DELETE')`).join(' AND ')} AS rpc_only_writes,
 ${rpcSignatures.map(f=>`has_function_privilege('authenticated','public.${f.signature}','EXECUTE') AND NOT has_function_privilege('anon','public.${f.signature}','EXECUTE') AND NOT has_function_privilege('service_role','public.${f.signature}','EXECUTE')`).join(' AND ')} AS authenticated_rpc_only,
 ${expectedFunctions.map(f=>['authenticated','anon','service_role'].map(role=>`has_function_privilege('${role}','public.${f.signature}','EXECUTE')=${f[role]}`).join(' AND ')).join(' AND ')} AS exact_function_grants,
 NOT has_table_privilege('authenticated','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 ${expectedTriggers.map(t=>`EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${t.name}' AND tgrelid='public.${t.table_name}'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='${t.definition_md5}')`).join(' AND ')} AS exact_provenance_triggers,
 ${expectedStoragePolicies.map(p=>`EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='${p.name}' AND md5(to_jsonb(x)::text)='${p.definition_md5}')`).join(' AND ')} AS exact_storage_boundaries;
`;
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${sql.trim().replace(/;$/,'')}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
const batch=`-- Generated UC007/009 plus signature file provenance; Edge first, then this atomic SQL. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC profile preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_profile_before(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_profile_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_profile_functions_before ON COMMIT DROP AS
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_profile_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r',t) INTO n,h;
 INSERT INTO uc_profile_before VALUES(t,n,h);END LOOP;END $snapshot$;
${migrations.map(m=>`DO $migration$ DECLARE source text:=$source_${m.version}$${m.source}$source_${m.version}$;BEGIN
 IF md5(source)<>'${m.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch ${m.version}';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${m.version}','${m.name}',ARRAY[source]);
END $migration$;`).join('\n')}
${assert(postcheck,'UC profile postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_profile_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x',r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_profile_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_profile_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE (p.oid::regprocedure::text NOT IN(${list(replacementSignatures)}) AND b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid))) OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl) THEN RAISE EXCEPTION 'Existing function changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_profile_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF ${tables.map(t=>`EXISTS(SELECT 1 FROM public.${t})`).join(' OR ')} THEN RAISE EXCEPTION 'Unexpected profile/decision backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
await writeFile(new URL('preflight.sql',folder),preflight);await writeFile(new URL('postcheck.sql',folder),postcheck);await writeFile(new URL('release-transaction.sql',folder),batch);
const files=['src/utils/storageHelpers.ts','src/utils/__tests__/storageHelpers.test.ts',
 'src/components/signing/ContractReviewBody.tsx','src/components/signing/ContractReviewDialog.tsx','src/components/signing/DocxRenderer.tsx',
 'src/components/signing/ExternalContractUploader.tsx','src/components/signing/SignatureRevisionUploader.tsx','src/components/signing/SignaturesJournal.tsx',
 'src/components/signing/SignedDocumentPreview.tsx','src/components/student/StudentDocumentsTab.tsx',
 'src/lib/signedDocumentPdf.ts','src/lib/signatureTokenFile.ts','src/lib/signatureFileUpload.ts',
 'src/hooks/useEducationComplianceProfile.ts','src/hooks/useDocumentApplicabilityDecisions.ts','src/hooks/useOrgDocumentsManager.ts',
 'src/components/organization/OrgDocumentsManager.tsx','src/components/organization/tabs/DocumentsTab.tsx'];
for(const dir of ['src/lib/uc-compliance/','src/components/organization/compliance/'])for(const f of await readdir(new URL(dir,root)))if(/\.tsx?$/.test(f)&&!f.includes('.test.'))files.push(dir+f);
const frontendFiles=[];for(const path of files.sort())frontendFiles.push({path,sourceSha256:hash(await read(path))});
const edgePaths=new Set();
async function includeEdge(path){if(edgePaths.has(path))return;edgePaths.add(path);const content=await read(path);for(const match of content.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)){if(!match[1].startsWith('.'))continue;const target=new URL(match[1],new URL(path,root));await includeEdge(fileURLToPath(target).replace(fileURLToPath(root),'').replaceAll('\\','/'));}}
await includeEdge('supabase/functions/get-signature-file/index.ts');
const edgeFiles=[];for(const path of [...edgePaths].sort())edgeFiles.push({path,sourceSha256:hash(await read(path))});
const config={path:'supabase/config.toml',sourceSha256:hash(await read('supabase/config.toml'))};
await writeFile(new URL('release-manifest.json',folder),JSON.stringify({release:'uc-education-profile-20261018',preparedOnly:true,migrationCount:2,batchSha256:hash(batch),
 newlineHashNormalization:'CRLF to LF only; executable and ledger store canonical LF source',migrations:migrations.map(({source,...m})=>m),priorMigrations:prior.map(({file,version,name,sourceMd5})=>({file,version,name,sourceMd5})),
 preservedTables:preserved,expectedFunctions,expectedTables,expectedTriggers,expectedStoragePolicies,replacementSignatures,frontendFiles,
 edgeFunctions:['get-signature-file'],edgeFiles,config,
 deploymentOrder:['Deploy frozen get-signature-file Edge with explicit verify_jwt=false and its token-only checks; missing SQL fails closed','One entire 108-109 SQL transaction after exact released100-107 baseline','Postcheck all true; old flat-upload UI fails closed until companion UI','Companion UI deploy, canonical uploads and explicit declarations; no profile/decision/file backfill']},null,2)+'\n');
console.log('Prepared combined108-109 atomic release; no deployment performed.');

