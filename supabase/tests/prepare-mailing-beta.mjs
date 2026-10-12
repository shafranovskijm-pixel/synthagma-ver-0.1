// Generate an additive, drift-guarded migration from an authorized catalog backup.
// This script reads catalog metadata only and never connects to production.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [beforePath,additionalPath]=process.argv.slice(2);
assert.ok(beforePath&&additionalPath,'Usage: node prepare-mailing-beta.mjs CATALOG_JSON ADDITIONAL_RPC_JSON');
const before=JSON.parse(await readFile(beforePath,'utf8'));
const rawAdditional=JSON.parse(await readFile(additionalPath,'utf8'));
const additional=Array.isArray(rawAdditional)?rawAdditional:rawAdditional.contact_report_rpc_backup;
assert.equal(additional.length,3);
const folder=root+'docs/releases/sintagma-production/mailing-beta-20261012/';
const digest=s=>createHash('md5').update(s.replaceAll('\r\n','\n')).digest('hex');
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const functions=[...before.functions,...additional];
const changed=['set_mailing_sender_warmup','import_mailing_senders_batch','activate_verified_mailing_senders',
 'attest_cold_outreach_campaign','import_mailing_contacts','create_mailing_report_link','revoke_mailing_report_link'];
const policies=before.policies.filter(p=>p.tablename.startsWith('mailing_'));
const expected=policies.map(p=>({table:p.tablename,name:p.policyname,command:p.cmd,permissive:p.permissive,
 roles:p.roles,qual_md5:digest(p.qual||''),check_md5:digest(p.with_check||'')}));
const functionExpected=functions.map(f=>({signature:f.signature,body_md5:f.body_md5,
 definition_md5:digest(f.definition)}));
const secretTables=['mailing_senders','mailing_deliverability_seeds','org_smtp_settings'];
const secretAcl=before.tables.filter(t=>secretTables.includes(t.name)).map(t=>({name:t.name,acl:t.acl}));
const guard=`DO $preflight$
DECLARE r jsonb; count_before integer;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(secretAcl))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||(r->>'name'))
   AND to_jsonb(c.relacl) IS NOT DISTINCT FROM r->'acl') THEN RAISE EXCEPTION 'Mailing secret table ACL drift: %',r->>'name'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(functionExpected))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
    AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
    AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5')
  THEN RAISE EXCEPTION 'Mailing helper/RPC drift: %',r->>'signature'; END IF;
 END LOOP;
 SELECT count(*) INTO count_before FROM pg_policies WHERE schemaname='public' AND tablename IN
  (${[...new Set(policies.map(p=>p.tablename))].map(lit).join(',')});
 IF count_before<>${expected.length} THEN RAISE EXCEPTION 'Mailing policy inventory drift'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${lit(JSON.stringify(expected))}::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='public' AND tablename=r->>'table' AND policyname=r->>'name'
   AND cmd=r->>'command' AND permissive=r->>'permissive' AND to_jsonb(roles)=r->'roles'
   AND md5(coalesce(qual,''))=r->>'qual_md5' AND md5(coalesce(with_check,''))=r->>'check_md5')
  THEN RAISE EXCEPTION 'Mailing policy drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regprocedure('public.save_mailing_sender(uuid,uuid,jsonb,text)') IS NOT NULL
 OR to_regprocedure('public.set_mailing_sender_active(uuid,uuid,boolean)') IS NOT NULL
 OR to_regprocedure('public.guard_mailing_sender_verification()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mailing_senders'::regclass AND tgname='mailing_sender_verification_guard')
 THEN RAISE EXCEPTION 'Mailing sender management already exists'; END IF;
END $preflight$;`;
let migration='-- S-004: align mailing operations with sales permissions and safely edit senders.\n-- No scheduling, activation, delivery, secret reads or existing business-row mutation.\n'+guard+'\n\n';
const changedHashes=[];
for(const p of policies.filter(p=>p.permissive==='PERMISSIVE')){
 const permission=p.cmd==='SELECT'?'sales.read':'sales.write';
 let expr=`(public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'${permission}'))`;
 if(p.tablename==='mailing_reply_scan_state') expr=`EXISTS(SELECT 1 FROM public.mailing_senders s WHERE s.id=mailing_reply_scan_state.sender_id AND public.can_access_organization(s.organization_id,'sales.read'))`;
 if(p.tablename==='mailing_send_jobs') expr=`EXISTS(SELECT 1 FROM public.email_campaigns c WHERE c.id=mailing_send_jobs.campaign_id AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(c.organization_id,'sales.read')))`;
 migration+=`DROP POLICY ${ident(p.policyname)} ON public.${ident(p.tablename)};\nCREATE POLICY ${ident(p.policyname)} ON public.${ident(p.tablename)} FOR ${p.cmd} TO authenticated\n`;
 if(p.cmd!=='INSERT')migration+=`USING (${expr})\n`;
 if(['INSERT','UPDATE','ALL'].includes(p.cmd))migration+=`WITH CHECK (${expr})\n`;
 migration+=';\n';
}
for(const name of changed){
 const original=functions.find(f=>f.signature.startsWith(name+'('));assert.ok(original,name);
 let definition=original.definition.replaceAll("'email.manage'","'sales.write'");
 if(name==='import_mailing_contacts'){
  const needle="has_role('admin'::app_role, auth.uid()) OR p_organization_id = current_organization_id()";
  assert.ok(definition.includes(needle)); definition=definition.replace(needle,"public.can_access_organization(p_organization_id, 'sales.write')");
 }
 if(['create_mailing_report_link','revoke_mailing_report_link'].includes(name))definition=definition.replaceAll("'sales.read'","'sales.write'");
 assert.ok(definition.includes('BEGIN\n'));
 definition=definition.replace('BEGIN\n',`BEGIN\n  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN\n    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';\n  END IF;\n`);
 if(name==='set_mailing_sender_warmup'){
  const needle='  UPDATE public.mailing_senders';assert.ok(definition.includes(needle));
  definition=definition.replace(needle,`  IF p_enabled IS TRUE AND NOT EXISTS(SELECT 1 FROM public.mailing_senders WHERE id=p_sender_id AND is_active AND smtp_status='ok' AND imap_status='ok') THEN\n    RAISE EXCEPTION 'warmup_requires_verified_active_sender' USING ERRCODE='22023';\n  END IF;\n\n${needle}`);
 }
 migration+='\n'+definition.trim()+';\n';
 changedHashes.push({signature:original.signature,body_md5:digest(definition.split('$function$')[1])});
 migration+=`REVOKE ALL ON FUNCTION public.${original.signature} FROM PUBLIC,anon;\nGRANT EXECUTE ON FUNCTION public.${original.signature} TO authenticated;\n`;
}
migration+='\n'+await readFile(folder+'sender-management.sql','utf8');
for(const table of secretTables){
 const columns=before.columns.filter(c=>c.table===table);
 const secret=columns.filter(c=>/password|secret/i.test(c.name));assert.ok(secret.length,table+' secret column');
 const safe=columns.filter(c=>!secret.includes(c));
 migration+=`\n-- Table SELECT overrides column restrictions; preserve non-secret UI reads only.\nREVOKE SELECT ON public.${ident(table)} FROM authenticated,anon,PUBLIC;\n`;
 migration+=`REVOKE SELECT (${secret.map(c=>ident(c.name)).join(',')}) ON public.${ident(table)} FROM authenticated,anon,PUBLIC;\n`;
 migration+=`GRANT SELECT (${safe.map(c=>ident(c.name)).join(',')}) ON public.${ident(table)} TO authenticated;\n`;
}
await writeFile(root+'supabase/migrations/20261012160000_mailing_beta_sender_access.sql',migration);
await writeFile(folder+'preflight.sql','-- Read-only catalog assertions; new objects must be absent.\n'+guard+'\n');
await writeFile(folder+'expected-before.json',JSON.stringify({functions:functionExpected,policies:expected},null,2)+'\n');
const newFunctions=[...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(guard_mailing_sender_verification|save_mailing_sender|set_mailing_sender_active)\([\s\S]*?AS (\$[a-z]+\$)([\s\S]*?)\2;/g)];
for(const f of newFunctions)changedHashes.push({signature:({guard_mailing_sender_verification:'guard_mailing_sender_verification()',save_mailing_sender:'save_mailing_sender(uuid,uuid,jsonb,text)',set_mailing_sender_active:'set_mailing_sender_active(uuid,uuid,boolean)'})[f[1]],body_md5:digest(f[3])});
assert.equal(newFunctions.length,3);
const catalogPolicyCheck=policies.filter(p=>p.permissive==='PERMISSIVE').map(p=>`SELECT ${lit('policy:'+p.tablename+'.'+p.policyname)} check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=${lit(p.tablename)} AND policyname=${lit(p.policyname)} AND cmd=${lit(p.cmd)} AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.${p.cmd==='SELECT'?'read':'write'}%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok`);
const checks=[...catalogPolicyCheck,
 ...changedHashes.map(f=>`SELECT ${lit('function:'+f.signature)} check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||${lit(f.signature)}) AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))=${lit(f.body_md5)}) ok`),
 ...secretTables.flatMap(table=>{
  const columns=before.columns.filter(c=>c.table===table);const secrets=columns.filter(c=>/password|secret/i.test(c.name));
  return [`SELECT ${lit('secret-read-denied:'+table)} check_name,${secrets.map(c=>`NOT has_column_privilege('authenticated','public.${table}',${lit(c.name)},'SELECT') AND NOT has_column_privilege('anon','public.${table}',${lit(c.name)},'SELECT') AND has_column_privilege('service_role','public.${table}',${lit(c.name)},'SELECT')`).join(' AND ')} ok`,
   `SELECT ${lit('safe-settings-readable:'+table)} check_name,${columns.filter(c=>!secrets.includes(c)).map(c=>`has_column_privilege('authenticated','public.${table}',${lit(c.name)},'SELECT')`).join(' AND ')} ok`];
 }),
 ...changedHashes.filter(f=>!f.signature.startsWith('guard_')).map(f=>`SELECT ${lit('rpc-acl:'+f.signature)} check_name,has_function_privilege('authenticated','public.${f.signature}','EXECUTE') AND NOT has_function_privilege('anon','public.${f.signature}','EXECUTE') ok`),
 `SELECT 'verification-trigger' check_name,EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mailing_senders'::regclass AND tgname='mailing_sender_verification_guard' AND tgenabled='O' AND tgfoid='public.guard_mailing_sender_verification()'::regprocedure) ok`,
 `SELECT 'restrictive-fences' check_name,(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN (${[...new Set(policies.map(p=>p.tablename))].map(lit).join(',')}) AND permissive='RESTRICTIVE' AND policyname='account_deletion_no_revoked_access' AND md5(qual)='99a326c0f33883b22c156502d80e9740' AND md5(with_check)='99a326c0f33883b22c156502d80e9740')=10 ok`];
const postcheck=checks.join('\nUNION ALL\n');
await writeFile(folder+'postcheck.sql',postcheck+';\n');
const immutableFunctions=functions.filter(f=>!changed.some(n=>f.signature.startsWith(n+'(')));
const preserved=`SELECT jsonb_build_object(
 'helpers',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN (${immutableFunctions.map(f=>`'public.${f.signature}'::regprocedure`).join(',')})),
 'table_security',(SELECT jsonb_agg(jsonb_build_object('table',relname,'owner',relowner,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relname IN (${before.tables.map(t=>lit(t.name)).join(',')}) AND relnamespace='public'::regnamespace),
 'other_policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN (${before.tables.map(t=>lit(t.name)).join(',')}) AND NOT (tablename LIKE 'mailing_%' AND permissive='PERMISSIVE')),
 'nonselect_table_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${before.tables.map(t=>lit(t.name)).join(',')}) AND g.privilege_type<>'SELECT'),
 'nonselect_column_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,a.attname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${before.tables.map(t=>lit(t.name)).join(',')}) AND g.privilege_type<>'SELECT'),
 'existing_triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid,tgname) FROM pg_trigger WHERE tgrelid IN (${before.tables.map(t=>`'public.${t.name}'::regclass`).join(',')}) AND NOT tgisinternal AND tgname<>'mailing_sender_verification_guard')
) AS security_snapshot`;
const bundle=`-- ONE SQL-editor request. Generated exact source, transactional ledger and asserting postchecks.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $ledger$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012160000') THEN RAISE EXCEPTION 'Mailing release replay refused'; END IF; END $ledger$;
${guard}
CREATE TEMP TABLE mailing_security_before ON COMMIT DROP AS ${preserved};
CREATE TEMP TABLE mailing_release_result(result jsonb) ON COMMIT PRESERVE ROWS;
DO $apply$ DECLARE source text:=$mailing_source$${migration}$mailing_source$; BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>${lit(digest(migration))} THEN RAISE EXCEPTION 'Mailing source hash mismatch'; END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261012160000','mailing_beta_sender_access',ARRAY[source]);
END $apply$;
DO $verify$ DECLARE r record; checks integer:=0; after_security jsonb; BEGIN
 FOR r IN ${postcheck} LOOP IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mailing postcheck failed: %',r.check_name; END IF; checks:=checks+1; END LOOP;
 SELECT security_snapshot INTO after_security FROM (${preserved}) q;
 IF after_security IS DISTINCT FROM (SELECT security_snapshot FROM mailing_security_before) THEN RAISE EXCEPTION 'Unrelated mailing security changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012160000' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))=${lit(digest(migration))}) THEN RAISE EXCEPTION 'Mailing ledger mismatch'; END IF;
 INSERT INTO mailing_release_result VALUES(jsonb_build_object('committed',true,'checks_passed',checks,'ledger_source_match',true,'preserved_security',true,'transaction_id',txid_current()));
END $verify$;
NOTIFY pgrst,'reload schema'; COMMIT;
SELECT result AS release_result FROM mailing_release_result;
`;
await writeFile(folder+'release-transaction.sql',bundle);
console.log(JSON.stringify({postchecks:checks.length,bundleSha256:createHash('sha256').update(bundle).digest('hex')}));
console.log(JSON.stringify({migrationMd5:digest(migration),beforeFunctions:functions.length,policiesChanged:policies.filter(p=>p.permissive==='PERMISSIVE').length,restrictivePoliciesPreserved:policies.filter(p=>p.permissive==='RESTRICTIVE').length}));
