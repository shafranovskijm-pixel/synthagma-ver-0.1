// Generates a guarded, single-request SQL-editor release from saved production metadata.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const folder=root+'docs/releases/sintagma-production/org-crm-links-20261012/';
const [catalogPath]=process.argv.slice(2);assert.ok(catalogPath,'Pass fresh saved catalog.json');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const md5=s=>createHash('md5').update(s.replaceAll('\r\n','\n')).digest('hex');
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const version='20261012210000';
const oldNames=['account_deletion_access_allowed','can_access_organization','is_org_owner','has_org_staff_permission','get_org_staff_permissions','org_role_default_permissions','normalize_org_staff_permission','has_role','is_student_profile','account_deletion_snapshot'];
const funcs=catalog.functions.filter(f=>oldNames.includes(f.name)||f.name.startsWith('org_crm_'));
assert.equal(funcs.length,19,'9 permission helpers + student + deletion + 8 CRM functions');
const deletion=funcs.find(f=>f.name==='account_deletion_snapshot');assert.ok(deletion);
const guards=funcs.map(f=>({signature:f.signature.replace(/^public\./,''),body_md5:f.body_md5??f.source_md5,definition_md5:md5(f.definition),acl:f.acl?.slice().sort()??null}));
const required={
 organizations:['id','subscription_plan'],profiles:['id','user_id','organization_id','company_id','full_name'],companies:['id','organization_id','name','inn'],
 student_roster_removals:['organization_id','user_id'],account_deletion_revocations:['user_id'],
 enrollments:['id','user_id','course_id','started_at','completed_at'],courses:['id','organization_id','title'],
 course_access_log:['id','user_id','course_id','organization_id','accessed_at'],student_login_history:['id','user_id','organization_id','logged_in_at'],
 company_documents:['id','company_id','uploaded_at','name','deleted_at'],student_documents:['id','enrollment_id','name','created_at'],
 education_document_records:['id','organization_id','user_id','enrollment_id','document_type','document_number','issue_date','created_at','deleted_at'],
 org_crm_clients:['id','organization_id','org_name','inn','created_by','created_at','updated_at'],
 org_crm_deals:['id','organization_id','client_id','title','created_at'],org_crm_tasks:['id','organization_id','client_id','title','created_at','completed_at','status'],
 org_crm_activities:['id','organization_id','client_id','activity_type','description','created_at']
};
const cols=Object.entries(required).flatMap(([t,names])=>names.map(name=>{
 const c=catalog.columns.find(c=>(c.table??c.table_name)===t&&(c.name??c.column_name)===name);assert.ok(c,`${t}.${name}`);
 return {table:t,name,type:c.type};
}));
const crmTables=['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'];
const newFunctions=['org_crm_resolve_subject','org_crm_link_subject','org_crm_context'];
const guard=`DO $preflight$
DECLARE r jsonb; t text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname IN('company_id','student_user_id','linked_at') AND NOT attisdropped) THEN RAISE EXCEPTION 'CRM subject columns already exist'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[${newFunctions.map(lit).join(',')}])) THEN RAISE EXCEPTION 'CRM subject functions already exist'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(guards))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature')) AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
   AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5'
   AND COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl)a),'null'::jsonb)=r->'acl') THEN RAISE EXCEPTION 'CRM links helper drift: %',r->>'signature'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(cols))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||(r->>'table')) AND a.attname=r->>'name' AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r->>'type') THEN RAISE EXCEPTION 'CRM links column drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY[${crmTables.map(lit).join(',')}] LOOP
  IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) OR NOT has_table_privilege('authenticated','public.'||t,'SELECT')
   OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'CRM links table access drift: %',t; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t)<>2 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='org_crm_read' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND qual='org_crm_access_allowed(organization_id, ''sales.read''::text)')
   OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE') THEN RAISE EXCEPTION 'CRM links policy drift: %',t; END IF;
 END LOOP;
END $preflight$;`;
const entry="  ('org_crm_clients','student_user_id'),\n";
const marker="  ('ai_avatar_templates','created_by'),";
assert.equal(deletion.definition.split(marker).length,2,'precise shared-data list');
const changedDeletion=deletion.definition.replace(marker,entry+marker);
assert.equal(changedDeletion.replace(entry,''),deletion.definition,'only one shared relation added');
const core=(await readFile(folder+'implementation.sql','utf8')).replaceAll('\r\n','\n');
const migration=`-- S-049: explicit company/student CRM links and permission-filtered factual chronology.\n${guard}\n\n${core}\n-- Keep copied student identity behind the existing shared-data deletion review.\n${changedDeletion};\n`;
await writeFile(root+`supabase/migrations/${version}_org_crm_links.sql`,migration);
await writeFile(folder+'preflight.sql',guard+'\n');
const added=[...core.matchAll(/CREATE FUNCTION public\.(\w+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$/g)].map(m=>({name:m[1],signature:m[1]+'('+m[2].split(',').map(a=>a.trim().split(/\s+/)[1]).join(',')+')',body_md5:md5(m[3])}));
assert.equal(added.length,3);
const changedBody=changedDeletion.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1]??changedDeletion.match(/AS \$fn\$([\s\S]*?)\$fn\$/)?.[1];assert.ok(changedBody);
const checks=[];const check=(name,sql)=>checks.push(`SELECT ${lit(name)} AS check_name,(${sql}) AS ok`);
for(const f of added){
 check(f.name+':body',`SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))=${lit(f.body_md5)} AND prosecdef FROM pg_proc WHERE oid='public.${f.signature}'::regprocedure`);
 check(f.name+':acl',`NOT has_function_privilege('anon','public.${f.signature}','EXECUTE') AND ${f.name==='org_crm_resolve_subject'?'NOT ':''}has_function_privilege('authenticated','public.${f.signature}','EXECUTE')`);
}
for(const col of ['company_id','student_user_id','linked_at'])check('column:'+col,`SELECT NOT attnotnull AND format_type(atttypid,atttypmod)=${lit(col==='linked_at'?'timestamp with time zone':'uuid')} FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname=${lit(col)} AND NOT attisdropped`);
check('source_fks_set_null',`SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.org_crm_clients'::regclass AND contype='f' AND confrelid IN('public.companies'::regclass,'public.profiles'::regclass) AND confdeltype='n' AND convalidated`);
check('unique_context_indexes',`SELECT count(*)=2 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.org_crm_clients'::regclass AND c.relname IN('org_crm_clients_company_subject','org_crm_clients_student_subject') AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL`);
check('one_source_and_link_date',`SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.org_crm_clients'::regclass AND conname IN('org_crm_clients_one_subject','org_crm_clients_link_timestamp') AND contype='c' AND convalidated`);
check('deletion_shared_relation',`SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))=${lit(md5(changedBody))} FROM pg_proc WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure`);
const postcheck=checks.join('\nUNION ALL\n');await writeFile(folder+'postcheck.sql',postcheck+';\n');
const preserved=`SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',CASE WHEN p.proname='account_deletion_snapshot' THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END,'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname<>ALL(ARRAY[${newFunctions.map(lit).join(',')}])),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY tgrelid,tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT tgisinternal)
) AS security_snapshot`;
const bundle=`-- Execute as ONE SQL editor request; no ordinary records are changed.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $ledger$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN RAISE EXCEPTION 'CRM links release replay refused'; END IF; END $ledger$;
${guard}
CREATE TEMP TABLE org_crm_links_security_before ON COMMIT DROP AS ${preserved};
CREATE TEMP TABLE org_crm_links_release_result(result jsonb) ON COMMIT PRESERVE ROWS;
DO $apply$ DECLARE source text:=$crm_links_source$${migration}$crm_links_source$; BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>${lit(md5(migration))} THEN RAISE EXCEPTION 'CRM links source hash mismatch'; END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','org_crm_links',ARRAY[source]);
END $apply$;
DO $verify$ DECLARE r record; checks integer:=0; after_security jsonb; BEGIN
 FOR r IN ${postcheck} LOOP IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CRM links postcheck failed: %',r.check_name; END IF; checks:=checks+1; END LOOP;
 SELECT security_snapshot INTO after_security FROM (${preserved})q;
 IF after_security IS DISTINCT FROM(SELECT security_snapshot FROM org_crm_links_security_before) THEN RAISE EXCEPTION 'Unrelated CRM links security changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))=${lit(md5(migration))}) THEN RAISE EXCEPTION 'CRM links ledger mismatch'; END IF;
 INSERT INTO org_crm_links_release_result VALUES(jsonb_build_object('committed',true,'checks_passed',checks,'ledger_source_match',true,'preserved_security',true,'transaction_id',txid_current()));
END $verify$;
NOTIFY pgrst,'reload schema'; COMMIT;
SELECT result AS release_result FROM org_crm_links_release_result;
`;
await writeFile(folder+'release-transaction.sql',bundle);
await writeFile(folder+'backup-before.sql',`SELECT jsonb_build_object('observed_at',clock_timestamp(),'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner)) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'org_crm_%' OR p.proname='account_deletion_snapshot')),'security',(SELECT security_snapshot FROM (${preserved})q),'crm_constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true))) FROM pg_constraint WHERE conrelid='public.org_crm_clients'::regclass)) AS backup;\n`);
const result={version,migrationMd5:md5(migration),bundleSha256:createHash('sha256').update(bundle).digest('hex'),postchecks:checks.length,helperGuards:guards,sourceFunctions:added,deletionBodyMd5:md5(changedBody)};
await writeFile(folder+'expected-release.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({version,migrationMd5:result.migrationMd5,bundleSha256:result.bundleSha256,postchecks:result.postchecks}));
