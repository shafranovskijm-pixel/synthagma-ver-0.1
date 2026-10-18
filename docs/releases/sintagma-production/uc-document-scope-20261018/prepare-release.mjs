import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./',import.meta.url),root=new URL('../../../../',folder);
const norm=s=>s.replaceAll('\r\n','\n'),hash=(s,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=p=>readFile(new URL(p,root),'utf8');
const quote=s=>"'"+s.replaceAll("'","''")+"'",list=a=>a.map(quote).join(',');
const names=['20261018104000_uc_document_staff_scope.sql','20261018105000_uc_document_action_permissions.sql','20261018106000_uc_gorel_draft_caller.sql','20261018107000_uc_document_reminder_scheduler.sql'];
const sources=await Promise.all(names.map(async file=>{
 const source=await read('supabase/migrations/'+file),begins=source.match(/^BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;\r?$/gm)||[],ends=source.match(/^COMMIT;\r?$/gm)||[];
 if(begins.length!==ends.length||begins.length>1||begins.length&&(!/^(?:\s|--[^\n]*\n)*BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;/.test(source)||!/COMMIT;\s*$/.test(source)))throw Error('Unexpected transaction boundaries '+file);
 if(begins[0]?.includes('ISOLATION')&&!file.startsWith('20261018107000'))throw Error('Unexpected isolation clause');
 const executable=begins.length?source.replace(/^BEGIN(?: ISOLATION LEVEL REPEATABLE READ)?;\r?$/m,'').replace(/^COMMIT;\r?$/m,''):source;
 const [version,...label]=file.slice(0,-4).split('_');return {file,version,name:label.join('_'),source,executable,stripOuterTransaction:!!begins.length,sourceSha256:hash(source),sourceMd5:hash(source,'md5'),executableMd5:hash(executable,'md5')};
}));
const foundation=JSON.parse(await read('docs/releases/sintagma-production/uc-document-foundation-20261018/release-manifest.json'));
const preserved=[...new Set([...foundation.preservedTables,'public.org_staff','public.admin_staff','public.user_roles','public.courses','public.lessons','public.student_groups','public.student_group_memberships','public.enrollment_history','public.test_attempts','public.lesson_progress','public.student_frdo_data','public.journal_instances','public.journal_entries','public.group_class_journal_marks','public.org_contracts','public.goreltech_document_operations'])];
const expectedLedger=items=>items.map(s=>`(version='${s.version}' AND name='${s.name}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='${s.sourceMd5}')`).join(' OR ');
const preflight=`-- Read-only. Never inspect or emit a scheduled command/credential.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE ${expectedLedger(foundation.migrations)}) AS exact_foundation_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN(${list(sources.map(s=>s.version))})) AS migrations_absent,
 to_regclass('public.org_staff_document_groups') IS NULL AND to_regclass('public.uc_goreltech_document_stages') IS NULL AS new_state_absent,
 md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure))='2e11495f3d3e6ca261af8a08ed874269' AS canonical_access_reviewed,
 md5(pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure))='201600eaeb4cb37dcea7791d0716dbb2'
 AND md5(pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure))='72c0bc7f4b6feaba492b305887bafb32' AS compiler_functions_reviewed,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND c.relkind='v' AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=1 AND bool_and(active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273' AND username=current_user AND database=current_database()) FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS reminder_job_reviewed,
 has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') AS cron_api_allowed;
`;
const postcheck=`-- Read-only deployment acceptance. Assignment/stage emptiness is checked only inside the release.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE ${expectedLedger(sources)}) AS exact_stage2_ledger,
 (SELECT count(*)=29 FROM pg_policies WHERE policyname='uc_document_assigned_read' AND permissive='RESTRICTIVE') AS assigned_read_boundaries,
 (SELECT count(*)=4 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'uc_document_assigned_storage_%' AND permissive='RESTRICTIVE') AS assigned_storage_boundaries,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=14 FROM pg_trigger WHERE tgname='uc_document_action_guard' AND NOT tgisinternal AND tgenabled='O') AS document_action_guards,
 NOT has_table_privilege('authenticated','public.org_staff_document_groups','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE') AS private_assignment_and_stage_state,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb)','EXECUTE') AS caller_and_compiler_separated,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='2d7b7e801492efbdf6bfac7f29731273') FROM cron.job WHERE jobname='process-document-expiry-reminders-daily') AS unsafe_reminder_paused;
`;
const assert=(sql,label)=>`DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (${sql.trim().replace(/;$/,'')}) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION '${label}: %',r;END IF;END $assert$;`;
let batch=`-- Generated stage2 only. Submit this ENTIRE file in ONE request; no historical bulk migrations.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
${assert(preflight,'UC stage2 preflight failed')}
LOCK TABLE ${preserved.join(',')} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_scope_before(table_name text PRIMARY KEY,column_list text,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_scope_restrictive_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE permissive='RESTRICTIVE' AND schemaname IN('public','storage');
CREATE TEMP TABLE uc_scope_cron_before ON COMMIT DROP AS SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='process-document-expiry-reminders-daily' THEN 'active' ELSE '__unchanged__' END)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;cols text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY[${list(preserved)}] LOOP
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\\n'' ORDER BY to_jsonb(r)::text),'''')) FROM (SELECT %s FROM %s) r',cols,t) INTO n,h;
 INSERT INTO uc_scope_before VALUES(t,cols,n,h);END LOOP;END $snapshot$;
`;
for(const [i,s] of sources.entries()){
 const delimiter=`$source_${s.version}$`;if(s.source.includes(delimiter))throw Error('Source delimiter collision');
 batch+=`DO $migration_${i}$ DECLARE source text:=${delimiter}${s.source}${delimiter};executable text;BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'${s.sourceMd5}' THEN RAISE EXCEPTION 'Source hash mismatch ${s.version}';END IF;
 executable:=${s.stripOuterTransaction?"regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\\r?$','','g'),E'(?m)^COMMIT;\\r?$','','g')":'source'};
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'${s.executableMd5}' THEN RAISE EXCEPTION 'Executable hash mismatch ${s.version}';END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('${s.version}','${s.name}',ARRAY[source]);
 END $migration_${i}$;
`;
}
batch+=`${assert(postcheck,'UC stage2 postcheck failed')}
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_scope_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),'''')) FROM (SELECT %s FROM %s) x',r.column_list,r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_scope_restrictive_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing restrictive policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_scope_cron_before b FULL JOIN (SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='process-document-expiry-reminders-daily' THEN 'active' ELSE '__unchanged__' END)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Unreviewed cron metadata changed';END IF;
 IF EXISTS(SELECT 1 FROM org_staff_document_groups) OR EXISTS(SELECT 1 FROM org_staff_document_scopes) OR EXISTS(SELECT 1 FROM org_staff_document_scope_events) OR EXISTS(SELECT 1 FROM uc_goreltech_document_stages) THEN RAISE EXCEPTION 'Unexpected assignment/stage backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
${postcheck}`;
await writeFile(new URL('preflight.sql',folder),preflight);await writeFile(new URL('postcheck.sql',folder),postcheck);await writeFile(new URL('release-transaction.sql',folder),batch);
const edges=['html-to-pdf','generate-self-examination-report','generate-signature-certificate','send-signing-email','org-create-contract-signature','create-org-staff','compile-docx-contract','compile-group-class-journal','process-document-expiry-reminders'];
const dependencies=new Map();async function inventory(url){
 if(!url.href.startsWith(root.href))throw Error('Import escapes repository');const path=decodeURIComponent(url.href.slice(root.href.length));if(dependencies.has(path))return;
 const source=await readFile(url,'utf8');dependencies.set(path,{path,sourceSha256:hash(source)});
 for(const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g))await inventory(new URL(m[1],url));
}
for(const edge of edges)await inventory(new URL('supabase/functions/'+edge+'/index.ts',root));
await writeFile(new URL('release-manifest.json',folder),JSON.stringify({release:'uc-document-scope-20261018',preparedOnly:true,migrationCount:4,batchSha256:hash(batch),newlineHashNormalization:'CRLF to LF only',migrations:sources.map(({source,executable,...x})=>x),preservedTables:preserved,edgeFunctions:edges,edgeDependencies:[...dependencies.values()].sort((a,b)=>a.path.localeCompare(b.path)),configSha256:hash(await read('supabase/config.toml')),deploymentOrder:['Hardened companion Edge first: fail closed on missing stage2 SQL','One entire 104–107 SQL transaction; reminder pause only','Companion UI, explicit teacher group assignments by owner, then real authorized smoke']},null,2)+'\n');
console.log('Prepared four stage2 migrations; no deployment performed.');
