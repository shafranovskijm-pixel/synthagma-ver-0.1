// Local generation only: consumes authorized metadata backups, never connects to production.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const folder=root+'docs/releases/sintagma-production/org-crm-beta-20261012/';
const [catalogPath,extraPath]=process.argv.slice(2);
assert.ok(catalogPath&&extraPath,'Pass saved catalog.json and catalog-extra.json');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const extra=JSON.parse(await readFile(extraPath,'utf8'));
const md5=s=>createHash('md5').update(s.replaceAll('\r\n','\n')).digest('hex');
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const tables=['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'];
const helperNames=['account_deletion_access_allowed','can_access_organization','is_org_owner','has_org_staff_permission','get_org_staff_permissions','org_role_default_permissions','normalize_org_staff_permission','has_role'];
const helpers=catalog.functions.filter(f=>helperNames.includes(f.name));
assert.equal(helpers.length,9);
const deletion=extra.functions.find(f=>f.name==='account_deletion_snapshot');assert.ok(deletion);
const guardFunctions=[...helpers.map(f=>({signature:f.signature,body_md5:f.body_md5,definition_md5:md5(f.definition),acl:f.acl?.slice().sort()??null})),
 {signature:'account_deletion_snapshot(uuid)',body_md5:deletion.source_md5,definition_md5:md5(deletion.definition),acl:deletion.acl?.slice().sort()??null}];
const columns={organizations:['id','subscription_plan'],org_staff:['user_id','organization_id','display_name','role','expires_at','can_receive_crm_tasks'],profiles:['user_id','organization_id','full_name']};
for(const [t,cols] of Object.entries(columns))for(const name of cols)assert.ok(catalog.columns.find(c=>c.table===t&&c.name===name),t+'.'+name);
const expectedCols=Object.entries(columns).flatMap(([t,cols])=>cols.map(name=>catalog.columns.find(c=>c.table===t&&c.name===name))).map(c=>({table:c.table,name:c.name,type:c.type}));
const guard=`DO $preflight$
DECLARE r jsonb; t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[${tables.map(lit).join(',')}] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN RAISE EXCEPTION 'CRM table already exists: %',t; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'org_crm_%') THEN RAISE EXCEPTION 'CRM function namespace already exists'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(guardFunctions))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
   AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
   AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5'
   AND COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),'null'::jsonb)=r->'acl') THEN RAISE EXCEPTION 'CRM helper drift: %',r->>'signature'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(expectedCols))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||(r->>'table')) AND a.attname=r->>'name'
   AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r->>'type') THEN RAISE EXCEPTION 'CRM prerequisite column drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regclass('auth.users') IS NULL OR to_regclass('public.account_deletion_revocations') IS NULL THEN RAISE EXCEPTION 'CRM prerequisite relation missing'; END IF;
END $preflight$;`;
let changedDeletion=deletion.definition;
const marker="  ('achievements','organization_id'),";
assert.equal(changedDeletion.split(marker).length,2,'precise existing organization shared-records list');
changedDeletion=changedDeletion.replace(marker,tables.map(t=>`  ('${t}','organization_id'),`).join('\n')+'\n'+marker);
assert.equal(changedDeletion.replace(tables.map(t=>`  ('${t}','organization_id'),`).join('\n')+'\n',''),deletion.definition,'only four list entries changed');
const core=(await readFile(folder+'implementation.sql','utf8')).replaceAll('\r\n','\n');
const migration=`-- S-048: isolated organization CRM Beta; no changes to legacy sales data/policies/RPCs.\n${guard}\n\n${core}\n-- Include CRM work in the existing owner-deletion preview before revocation.\n${changedDeletion};\n`;
await writeFile(root+'supabase/migrations/20261012200000_org_crm_beta.sql',migration);
await writeFile(folder+'preflight.sql',guard+'\n');
const sourceFunctions=[...core.matchAll(/CREATE FUNCTION public\.(\w+)\(([^)]*)\)[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$/g)].map(m=>({name:m[1],signature:m[1]+'('+m[2].split(',').map(a=>a.trim().split(/\s+/)[1]).join(',')+')',body_md5:md5(m[3])}));
assert.equal(sourceFunctions.length,8);
const changedBody=changedDeletion.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1]??changedDeletion.match(/AS \$fn\$([\s\S]*?)\$fn\$/)?.[1];
assert.ok(changedBody,'pg_get_functiondef dollar body');
const checks=[];
const check=(name,sql)=>checks.push(`SELECT ${lit(name)} AS check_name,(${sql}) AS ok`);
for(const t of tables){
 check(t+':rls',`SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass`);
 check(t+':scope_required',`SELECT attnotnull FROM pg_attribute WHERE attrelid='public.${t}'::regclass AND attname='organization_id'`);
 check(t+':authenticated_read_only',`has_table_privilege('authenticated','public.${t}','SELECT') AND NOT has_table_privilege('authenticated','public.${t}','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`);
 check(t+':anon_closed',`NOT has_table_privilege('anon','public.${t}','SELECT,INSERT,UPDATE,DELETE')`);
 check(t+':policy_inventory',`SELECT count(*)=2 AND count(*) FILTER(WHERE policyname='org_crm_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[])=1 AND count(*) FILTER(WHERE policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[])=1 FROM pg_policies WHERE schemaname='public' AND tablename='${t}'`);
}
for(const f of sourceFunctions){
 check(f.name+':body',`SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))=${lit(f.body_md5)} AND prosecdef FROM pg_proc WHERE oid='public.${f.signature}'::regprocedure`);
 const exposed=!['org_crm_task_assignees','org_crm_require_write'].includes(f.name);
 check(f.name+':grant',`NOT has_function_privilege('anon','public.${f.signature}','EXECUTE') AND ${exposed?'':'NOT '}has_function_privilege('authenticated','public.${f.signature}','EXECUTE')`);
}
check('same_tenant_foreign_keys',`SELECT count(*)=9 FROM pg_constraint WHERE conrelid IN (${tables.map(t=>`'public.${t}'::regclass`).join(',')}) AND contype='f' AND confrelid IN ('public.organizations'::regclass,'public.org_crm_clients'::regclass,'public.org_crm_deals'::regclass)`);
check('account_deletion_snapshot:four_new_tables_only',`SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))=${lit(md5(changedBody))} FROM pg_proc WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure`);
const postcheck=checks.join('\nUNION ALL\n');await writeFile(folder+'postcheck.sql',postcheck+';\n');
const preserved=`SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',CASE WHEN p.proname='account_deletion_snapshot' THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END,'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname NOT LIKE 'org_crm_%'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname NOT LIKE 'org_crm_%'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename NOT LIKE 'org_crm_%'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY tgrelid,tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND c.relname NOT LIKE 'org_crm_%' AND NOT tgisinternal)
) AS security_snapshot`;
const bundle=`-- Run as ONE SQL editor request. Exact source, rollback on any drift/check/ledger error.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $ledger$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012200000') THEN RAISE EXCEPTION 'CRM release replay refused'; END IF; END $ledger$;
${guard}
CREATE TEMP TABLE org_crm_security_before ON COMMIT DROP AS ${preserved};
CREATE TEMP TABLE org_crm_release_result(result jsonb) ON COMMIT PRESERVE ROWS;
DO $apply$ DECLARE source text:=$crm_source$${migration}$crm_source$; BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>${lit(md5(migration))} THEN RAISE EXCEPTION 'CRM source hash mismatch'; END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261012200000','org_crm_beta',ARRAY[source]);
END $apply$;
DO $verify$ DECLARE r record; checks integer:=0; after_security jsonb; BEGIN
 FOR r IN ${postcheck} LOOP IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CRM postcheck failed: %',r.check_name; END IF; checks:=checks+1; END LOOP;
 SELECT security_snapshot INTO after_security FROM (${preserved}) q;
 IF after_security IS DISTINCT FROM(SELECT security_snapshot FROM org_crm_security_before) THEN RAISE EXCEPTION 'Unrelated CRM security changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012200000' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))=${lit(md5(migration))}) THEN RAISE EXCEPTION 'CRM ledger mismatch'; END IF;
 INSERT INTO org_crm_release_result VALUES(jsonb_build_object('committed',true,'checks_passed',checks,'ledger_source_match',true,'preserved_security',true,'transaction_id',txid_current()));
END $verify$;
NOTIFY pgrst,'reload schema'; COMMIT;
SELECT result AS release_result FROM org_crm_release_result;
`;
await writeFile(folder+'release-transaction.sql',bundle);
const result={version:'20261012200000',migrationMd5:md5(migration),bundleSha256:createHash('sha256').update(bundle).digest('hex'),postchecks:checks.length,helperGuards:guardFunctions,sourceFunctions,deletionBodyMd5:md5(changedBody)};
await writeFile(folder+'expected-release.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({version:result.version,migrationMd5:result.migrationMd5,bundleSha256:result.bundleSha256,postchecks:result.postchecks}));
