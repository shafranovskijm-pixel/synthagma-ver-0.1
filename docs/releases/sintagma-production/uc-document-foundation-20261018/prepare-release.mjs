import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const normalize=s=>s.replaceAll('\r\n','\n');
const hash=(s,algorithm='sha256')=>createHash(algorithm).update(normalize(s)).digest('hex');
const read=async p=>readFile(new URL(p,root),'utf8');
const baseline=JSON.parse(await read('supabase/tests/fixtures/uc-release-baseline.json'));
const access=JSON.parse(await read('supabase/tests/fixtures/uc-document-access-baseline.json'));
const names=['20261018100000_uc_document_access_boundaries.sql','20261018101000_uc_signature_integrity.sql','20261018102000_uc_document_versions.sql','20261018103000_uc_document_cleanup_scheduler.sql'];
const sources=await Promise.all(names.map(async file=>{
 const source=await read('supabase/migrations/'+file);
 const begin=source.match(/^BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;\r?$/gm)||[],end=source.match(/^COMMIT;\r?$/gm)||[];
 if(begin.length!==end.length||begin.length>1||begin.length&&(!/^(?:\s|--[^\n]*\n)*BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;/.test(source)||!/COMMIT;\s*$/.test(source)))throw Error('Unexpected transaction boundary '+file);
 if(begin[0]?.includes('ISOLATION')&&!file.startsWith('20261018103000'))throw Error('Unexpected isolation clause');
 const executable=begin.length?source.replace(/^BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;\r?$/m,'').replace(/^COMMIT;\r?$/m,''):source;
 const [version,...label]=file.slice(0,-4).split('_');
 return {file,version,name:label.join('_'),source,executable,stripOuterTransaction:begin.length===1,sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(executable,'md5')};
}));
const sqlList=a=>a.map(s=>"'"+s.replaceAll("'","''")+"'").join(',');
const versions=sqlList(sources.map(s=>s.version));
const patchedNames=[...new Set(sources.slice(1).flatMap(s=>[...s.source.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)/g)].map(m=>m[1])))];
const additionalTables=['document_signatures','signature_revisions','signature_comments','pep_agreements','org_document_versions'];
const tables=[...access.tables,...additionalTables];
const preserved=[...tables,'document_number_sequences','organizations','profiles','companies','enrollments'].map(t=>'public.'+t).concat(['storage.objects','storage.buckets']);
const originalPermissive=sources[0].source.match(/\$baseline\$([\s\S]*?)\$baseline\$::jsonb/)[1];
const expectedFunctions=baseline.functions.map(({signature,md5})=>({signature,md5}));
// Access metadata uses names/definitions; use reviewed literal hashes from its own preflight.
const accessHashCheck=sources[0].source.match(/IF (md5\(pg_get_functiondef[\s\S]*?)\n THEN RAISE EXCEPTION 'UC document access: unreviewed function baseline'/)[1].replace(/ <> /g,' = ').replace(/\n OR /g,'\n AND ');
const preflight=`SELECT
 (${accessHashCheck}) AS access_functions_match,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text COLLATE "C"),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${sqlList(patchedNames)}))=$functions$${JSON.stringify(expectedFunctions)}$functions$::jsonb AS signature_functions_match,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies p
  WHERE schemaname='public' AND tablename IN(${sqlList(additionalTables)}))=$policies$${JSON.stringify(baseline.policies)}$policies$::jsonb AS signature_version_policies_match,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies p WHERE permissive='PERMISSIVE' AND (
  schemaname='public' AND tablename IN(${sqlList(access.tables)}) OR schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,''))~'(student-documents|company-documents)'))=$access$${originalPermissive}$access$::jsonb AS access_policies_match,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN(${versions})) AS migrations_absent,
 NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='org_documents' AND column_name='document_revision') AS versions_absent,
 (SELECT count(*)=${tables.length} AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN(${sqlList(tables)})) AS rls_enabled,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT') AND has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') AS ledger_access,
 (SELECT count(*)=1 AND bool_and(active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7' AND username=current_user AND database=current_database()) FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS cleanup_job_reviewed,
 has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') AS cron_api_allowed;
`;
await writeFile(new URL('preflight.sql',folder),preflight);
const triggerNames=sources.flatMap(s=>[...s.source.matchAll(/CREATE TRIGGER ([a-z_]+)/g)].map(m=>m[1]));
const postcheck=`-- Read-only metadata acceptance. No claims, issuance, signing or Storage writes.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE ${sources.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ')}) AS exact_migration_ledger,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_group_document_batch(uuid,uuid,jsonb)','EXECUTE') AS no_anonymous_document_rpc,
 NOT has_function_privilege('authenticated','public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)','EXECUTE') AS service_only_finalize,
 NOT has_table_privilege('authenticated','public.org_document_versions','INSERT')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','UPDATE')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','DELETE') AS versions_immutable,
 (SELECT count(*)=${triggerNames.length} FROM pg_trigger WHERE tgname IN(${sqlList(triggerNames)}) AND NOT tgisinternal AND tgenabled='O') AS triggers_enabled,
 (SELECT count(*)=11 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND permissive='RESTRICTIVE'
   AND policyname IN('uc_document_objects_read_guard','uc_document_objects_insert_guard','uc_document_objects_update_guard','uc_document_objects_delete_guard','uc_billing_document_upload_guard',
    'uc_signature_file_read_boundary','uc_signature_file_insert_boundary','uc_signature_file_update_boundary','uc_signature_file_delete_boundary','uc_org_document_blob_no_overwrite','uc_org_document_blob_no_delete')) AS storage_boundaries,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 NOT EXISTS(SELECT 1 FROM public.org_document_write_tokens) AS no_durable_write_token,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7') FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS unsafe_cleanup_paused;
`;
await writeFile(new URL('postcheck.sql',folder),postcheck);
const assertQuery=(query,label)=>`DO $check$ DECLARE result jsonb; BEGIN SELECT to_jsonb(q) INTO result FROM (${query.trim().replace(/;$/,'')}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(result) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',result; END IF; END $check$;`;
let batch=`-- Generated exact-source UC release. Submit the ENTIRE file as ONE SQL request.
-- Prepared only: this generator never connects to production.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assertQuery(preflight,'UC release preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_release_before(table_name text PRIMARY KEY,column_list text,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_release_restrictive_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE permissive='RESTRICTIVE' AND schemaname IN('public','storage');
-- Read-only witnesses for extension metadata: no direct cron table lock/update.
CREATE TEMP TABLE uc_release_cron_before ON COMMIT DROP AS SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='purge-recycle-bin-storage-daily' THEN 'active' ELSE '__unchanged__' END)::text) AS hash FROM cron.job j;
DO $snapshot$ DECLARE t text; cols text; n bigint; h text; BEGIN
 FOREACH t IN ARRAY ARRAY[${sqlList(preserved)}] LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM (SELECT %s FROM %s) r',cols,t) INTO n,h;
  INSERT INTO uc_release_before VALUES(t,cols,n,h);
 END LOOP; END $snapshot$;
`;
for(const [i,s] of sources.entries()){
 const delimiter=`$source_${s.version}$`;if(s.source.includes(delimiter))throw Error('Delimiter collision');
 batch+=`\nDO $migration_${i}$ DECLARE source text := ${delimiter}${s.source}${delimiter}; executable text;
 BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'${s.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch: ${s.version}'; END IF;
 executable := ${s.stripOuterTransaction?"regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\\r?$','','g'),E'(?m)^COMMIT;\\r?$','','g')":'source'};
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'${s.executableMd5}' THEN RAISE EXCEPTION 'Executable hash mismatch: ${s.version}'; END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${s.version}','${s.name}',ARRAY[source]);
 END $migration_${i}$;\n`;
}
batch+=`${assertQuery(postcheck,'UC release postcheck failed')}
DO $preserve$ DECLARE r record; n bigint; h text; BEGIN
 FOR r IN SELECT * FROM uc_release_before LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM (SELECT %s FROM %s) x',r.column_list,r.table_name) INTO n,h;
  IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %; release rolled back',r.table_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM uc_release_restrictive_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname)
  WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing restrictive policy changed'; END IF;
 IF EXISTS(SELECT 1 FROM uc_release_cron_before b FULL JOIN
   (SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='purge-recycle-bin-storage-daily' THEN 'active' ELSE '__unchanged__' END)::text) AS hash FROM cron.job j) a USING(jobid)
   WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Unreviewed cron metadata changed'; END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';
COMMIT;
${postcheck}`;
await writeFile(new URL('release-transaction.sql',folder),batch);
const edgeFunctions=['html-to-pdf','generate-self-examination-report','finalize-signature','generate-signature-certificate','send-signing-email','org-create-contract-signature','public-verify-document','purge-recycle-bin-storage'];
const dependencies=new Map();
async function inventory(url){
 if(!url.href.startsWith(root.href))throw Error('Import escapes repository');
 const file=decodeURIComponent(url.href.slice(root.href.length));if(dependencies.has(file))return;
 const source=await readFile(url,'utf8');const imports=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)].map(m=>new URL(m[1],url));
 dependencies.set(file,{path:file,sourceSha256:hash(source)});for(const child of imports)await inventory(child);
}
for(const name of edgeFunctions)await inventory(new URL(`supabase/functions/${name}/index.ts`,root));
await writeFile(new URL('release-manifest.json',folder),JSON.stringify({release:'uc-document-foundation-20261018',preparedOnly:true,migrationCount:4,batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only',migrations:sources.map(({source,executable,...s})=>s),edgeFunctions,edgeDependencies:[...dependencies.values()].sort((a,b)=>a.path.localeCompare(b.path)),configSha256:hash(await read('supabase/config.toml')),preservedTables:preserved,deploymentOrder:['Hardened Edge handlers first; signing/version operations fail closed until new SQL exists','Run one entire SQL transaction including pause of the legacy anonymous cleanup job','Deploy companion UI and perform ordinary authorized UI smoke checks']},null,2)+'\n');
console.log('Prepared UC release with 4 exact-source migrations; no deployment performed.');
