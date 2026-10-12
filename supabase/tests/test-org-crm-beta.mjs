// In-memory PostgreSQL only. Synthetic accounts and CRM records; no network or mail.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const folder=root+'docs/releases/sintagma-production/org-crm-beta-20261012/';
const [catalogPath,extraPath]=process.argv.slice(2);assert.ok(catalogPath&&extraPath);
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const extra=JSON.parse(await readFile(extraPath,'utf8'));
const expected=JSON.parse(await readFile(folder+'expected-release.json','utf8'));
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH||'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js').href);
const db=new PGlite();let assertions=0;
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const q=(sql,args)=>db.query(sql,args);
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const actor=async n=>db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${uid(n)}'`);
const rpc=async(name,args)=>(await q(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const denied=async(fn,pattern=/crm_forbidden|permission denied/)=>{
 await db.exec('SAVEPOINT expected_denial');
 await assert.rejects(fn,e=>pattern.test(e.message));assertions++;
 await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial');
};
const snapshot=org=>rpc('org_crm_snapshot',[uid(org)]);
const save=(kind,org,id,values,version=null)=>rpc('org_crm_save_'+kind,[uid(org),id,values,version]);
try{
 await db.exec('BEGIN');
 await db.exec(await readFile(root+'docs/releases/sintagma-production/staff-workspace-20261012/synthetic-fixture.sql','utf8'));
 await db.exec(`CREATE TABLE auth.users(id uuid PRIMARY KEY);
 DROP FUNCTION has_role(uuid,app_role),has_role(app_role,uuid);
 INSERT INTO auth.users SELECT user_id FROM profiles;
 ALTER TABLE profiles ADD COLUMN full_name text;
 ALTER TABLE org_staff ADD COLUMN display_name text NOT NULL DEFAULT '', ADD COLUMN can_receive_crm_tasks boolean NOT NULL DEFAULT false;
 UPDATE org_staff SET can_receive_crm_tasks=true WHERE role IN('admin','sales_manager');
 UPDATE profiles SET full_name='Synthetic '||right(user_id::text,2);
 INSERT INTO auth.users VALUES('${uid(12)}'); INSERT INTO profiles VALUES('${uid(12)}','${uid(200)}','Owner B');
 INSERT INTO user_roles VALUES('${uid(12)}','organization');
 UPDATE organizations SET subscription_plan='standard' WHERE id='${uid(200)}';
 SET LOCAL check_function_bodies=off;`);
 const selected=catalog.functions.filter(f=>expected.helperGuards.some(g=>g.signature===f.signature));
 selected.push({...extra.functions.find(f=>f.name==='account_deletion_snapshot'),signature:'account_deletion_snapshot(uuid)'});
 const roles=new Set((await q('SELECT rolname FROM pg_roles')).rows.map(r=>r.rolname));
 for(const f of selected){
  await db.exec(f.definition);
  if(f.acl!==null){
   await db.exec(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC`);
   for(const a of f.acl){
    const [,who,privileges]=a.match(/^([^=]*)=([^/]*)\//)||[];assert.ok(privileges!==undefined);
    if(who&&!roles.has(who)){await db.exec('CREATE ROLE '+ident(who));roles.add(who);}
    if(privileges.includes('X'))await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${who?ident(who):'PUBLIC'}`);
   }
  }
 }
 const deletionBefore=(await q("SELECT pg_get_functiondef('account_deletion_snapshot(uuid)'::regprocedure) d")).rows[0].d;
 const migration=await readFile(root+'supabase/migrations/20261012200000_org_crm_beta.sql','utf8');
 const bundle=await readFile(folder+'release-transaction.sql','utf8');
 await db.exec('SAVEPOINT drift');
 await db.exec("CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql AS 'SELECT true'");
 await denied(()=>db.exec(migration),/CRM helper drift/);
 await db.exec('ROLLBACK TO SAVEPOINT drift; RELEASE SAVEPOINT drift');
 await db.exec(`CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT fixture_ledger_failure CHECK(version<>'20261012200000'); COMMIT;`);
 await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('fixture_ledger_failure'));assertions++;
 await db.exec('ROLLBACK');
 equal((await q("SELECT to_regclass('public.org_crm_clients') v")).rows[0].v,null,'ledger failure rolls schema back');
 equal((await q("SELECT pg_get_functiondef('account_deletion_snapshot(uuid)'::regprocedure) d")).rows[0].d,deletionBefore,'ledger failure rolls deletion preview back');
 await db.exec('ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT fixture_ledger_failure');
 const applied=await db.exec(bundle);
 const result=applied.flatMap(r=>r.rows||[]).find(r=>r.release_result)?.release_result;
 equal(result?.checks_passed,expected.postchecks,'all exact atomic bundle postchecks');
 equal(result?.preserved_security,true,'old helpers/table grants/RLS/policies/triggers unchanged');
 equal((await q("SELECT statements FROM supabase_migrations.schema_migrations WHERE version='20261012200000'")).rows[0].statements,[migration],'ledger stores exact complete source');
 await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('replay refused'));assertions++;
 await db.exec('ROLLBACK; BEGIN');
 await actor(6); // Sales staff assigned to A with a profile in B.
 equal((await snapshot(100)).clients,[],'new workspace honestly empty');
 const clientA=await save('client',100,null,{org_name:'Synthetic client A',inn:'1234567890',email:'client@example.test',notes:'A-only note'});
 equal(Object.keys(clientA).sort(),['id','updated_at'],'client receipt is an object');
 const clientA2=await save('client',100,null,{org_name:'Second client'});
 await actor(12);const clientB=await save('client',200,null,{org_name:'Synthetic foreign client'});
 await actor(6);
 equal((await q('SELECT org_name FROM org_crm_clients ORDER BY org_name')).rows.map(r=>r.org_name),['Second client','Synthetic client A'],'direct read RLS isolates staff tenant');
 await denied(()=>snapshot(200));
 await denied(()=>save('client',200,clientB.id,{org_name:'Foreign write'},clientB.updated_at));
 await denied(()=>save('client',100,clientB.id,{org_name:'Forged organization'},clientB.updated_at),/crm_not_found/);
 await denied(()=>save('client',100,null,{org_name:'spoof',created_by:uid(2)}),/crm_invalid_fields/);
 await denied(()=>save('client',100,null,{org_name:{nested:'invalid'}}),/crm_invalid_field_type/);
 await denied(()=>save('client',100,null,{org_name:'invalid',email:'not-email'}),/check constraint/);
 await denied(()=>q("INSERT INTO org_crm_clients(organization_id,org_name) VALUES($1,'bypass')",[uid(100)]));
 await denied(()=>q("UPDATE org_crm_clients SET org_name='bypass' WHERE id=$1",[clientA.id]));
 await denied(()=>q('DELETE FROM org_crm_clients WHERE id=$1',[clientA.id]));
 const changed=await save('client',100,clientA.id,{phone:'+7 000 000 00 00'},clientA.updated_at);
 assert.notEqual(changed.updated_at,clientA.updated_at);assertions++;
 await denied(()=>save('client',100,clientA.id,{notes:'lost update'},clientA.updated_at),/crm_conflict/);
 await denied(()=>save('client',100,clientA.id,{notes:'missing version'}),/crm_conflict/);
 equal((await snapshot(100)).clients.find(c=>c.id===clientA.id).notes,'A-only note','partial update preserves omitted fields');
 const deal=await save('deal',100,null,{client_id:clientA.id,title:'Training discussion',amount:1500.25});
 await denied(()=>save('deal',100,null,{client_id:clientB.id,title:'Foreign client'}),/crm_client_not_found/);
 await denied(()=>save('deal',100,null,{client_id:clientA.id,title:'Negative',amount:-1}),/check constraint/);
 await denied(()=>save('deal',100,null,{client_id:clientA.id,title:'NaN',amount:'NaN'}),/check constraint/);
 await denied(()=>save('deal',100,null,{client_id:clientA.id,title:'Status',stage:'signed'}),/check constraint/);
 const won=await save('deal',100,deal.id,{stage:'won'},deal.updated_at);
 equal((await snapshot(100)).deals[0].stage,'won','deal stage persists independently of legal documents');
 await denied(()=>save('deal',100,deal.id,{stage:'lost'},deal.updated_at),/crm_conflict/);
 const assignees=(await snapshot(100)).assignees;
 equal(assignees.map(a=>a.user_id).sort(),[uid(1),uid(3),uid(6)].sort(),'only owner and active opted-in same-tenant non-revoked staff');
 equal(assignees.every(a=>a.email===null),true,'assignee email not unnecessarily exposed');
 const task=await save('task',100,null,{client_id:clientA.id,deal_id:deal.id,title:'Call tomorrow',due_date:'2026-10-13T10:00:00+10:00',assigned_user_id:uid(6)});
 await denied(()=>save('task',100,null,{client_id:clientA2.id,deal_id:deal.id,title:'Wrong relation',due_date:'2026-10-13'}),/crm_deal_not_found/);
 await denied(()=>save('task',100,null,{client_id:clientB.id,title:'Foreign',due_date:'2026-10-13'}),/crm_client_not_found/);
 for(const n of [4,5,9,12])await denied(()=>save('task',100,null,{client_id:clientA.id,title:'Bad assignee',due_date:'2026-10-13',assigned_user_id:uid(n)}),/crm_assignee_unavailable/);
 await denied(()=>save('task',100,null,{client_id:clientA.id,title:'Infinite',due_date:'infinity'}),/check constraint/);
 let done=await save('task',100,task.id,{status:'done'},task.updated_at);
 equal((await snapshot(100)).tasks[0].completed_at!==null,true,'completion timestamp generated on server');
 await denied(()=>save('task',100,task.id,{status:'cancelled'},task.updated_at),/crm_conflict/);
 done=await save('task',100,task.id,{status:'pending'},done.updated_at);
 equal((await snapshot(100)).tasks[0].completed_at,null,'reopen clears completed timestamp');
 await rpc('org_crm_add_activity',[uid(100),clientA.id,deal.id,'call','Discussed the training program']);
 await denied(()=>rpc('org_crm_add_activity',[uid(100),clientB.id,null,'note','Foreign']),/crm_client_not_found/);
 await denied(()=>rpc('org_crm_add_activity',[uid(100),clientA2.id,deal.id,'note','Wrong deal']),/crm_deal_not_found/);
 await denied(()=>rpc('org_crm_add_activity',[uid(100),clientA.id,null,'note','   ']),/check constraint/);
 let snap=await snapshot(100);
 equal(snap.activities[0].actor_user_id,uid(6),'activity actor is the caller');
 equal(snap.counts,{clients:2,deals:1,tasks:1,activities:1},'saved chain appears in one snapshot');
 equal(snap.truncated,{clients:false,deals:false,tasks:false,activities:false},'small snapshot is complete');
 equal(JSON.stringify(snap).includes('never exposed'),false,'organization private columns not included');
 await actor(3);equal((await snapshot(100)).clients.length,2,'default admin sales.read is read-only');
 await denied(()=>save('client',100,null,{org_name:'Read-only'}));
 await denied(()=>save('deal',100,deal.id,{stage:'lost'},won.updated_at));
 await denied(()=>save('task',100,task.id,{status:'done'},done.updated_at));
 await denied(()=>rpc('org_crm_add_activity',[uid(100),clientA.id,null,'note','Read-only']));
 for(const n of [4,5,8,9]){
  await actor(n);await denied(()=>snapshot(100));await denied(()=>save('client',100,null,{org_name:'Denied'}));
  equal((await q('SELECT id FROM org_crm_clients')).rows,[],'teacher/expired/student/revoked direct read denied '+n);
 }
 for(const n of [1,2]){await actor(n);equal((await snapshot(100)).clients.length,2,'owner/global-admin access '+n);}
 await actor(12);await denied(()=>snapshot(100));
 await db.exec('RESET ROLE');
 // Composite foreign keys protect service-level writes as well as RPC validation.
 await denied(()=>q("INSERT INTO org_crm_deals(organization_id,client_id,title) VALUES($1,$2,'Wrong org')",[uid(100),clientB.id]),/foreign key constraint/);
 await denied(()=>q("INSERT INTO org_crm_tasks(organization_id,client_id,deal_id,title,due_date) VALUES($1,$2,$3,'Wrong client',now())",[uid(100),clientA2.id,deal.id]),/foreign key constraint/);
 const afterDeletion=(await q("SELECT prosrc FROM pg_proc WHERE oid='account_deletion_snapshot(uuid)'::regprocedure")).rows[0].prosrc;
 const beforeBody=deletionBefore.match(/AS \$function\$([\s\S]*?)\$function\$/)[1];
 const newNames=['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'];
 equal(afterDeletion.replace(newNames.map(t=>`  ('${t}','organization_id'),`).join('\n')+'\n',''),beforeBody,'deletion preview changed only four organization shared-record entries');
 const shared=(await q(`SELECT ${newNames.map(t=>`(SELECT count(*) FROM ${t} WHERE organization_id='${uid(100)}')`).join('+')} AS n`)).rows[0].n;
 equal(Number(shared),5,'new records contribute to existing owner-transfer blocker');
 await denied(()=>q('DELETE FROM organizations WHERE id=$1',[uid(100)]),/foreign key constraint/);
 for(const plan of ['free','start','unknown']){
  await db.exec('RESET ROLE');await q('UPDATE organizations SET subscription_plan=$1 WHERE id=$2',[plan,uid(100)]);await actor(1);
  await denied(()=>snapshot(100));await denied(()=>save('client',100,null,{org_name:'Plan bypass'}));
  equal((await q('SELECT id FROM org_crm_clients WHERE organization_id=$1',[uid(100)])).rows,[],'plan gate on direct reads '+plan);
 }
 for(const plan of ['standard','professional','maximum']){
  await db.exec('RESET ROLE');await q('UPDATE organizations SET subscription_plan=$1 WHERE id=$2',[plan,uid(100)]);await actor(1);
  equal((await snapshot(100)).clients.length,2,'plan enabled '+plan);
 }
 await denied(()=>rpc('org_crm_task_assignees',[uid(200)]));
 await denied(()=>rpc('org_crm_require_write',[uid(100),{},[]]));
 await db.exec('RESET ROLE; SET LOCAL ROLE anon');await denied(()=>snapshot(100));
 await db.exec('RESET ROLE');
 await q("INSERT INTO org_crm_clients(organization_id,org_name) SELECT $1,'Extra '||n FROM generate_series(1,999)n",[uid(100)]);
 await q("INSERT INTO org_crm_activities(organization_id,client_id,activity_type,description) SELECT $1,$2,'note','Extra '||n FROM generate_series(1,500)n",[uid(100),clientA.id]);
 await actor(6);snap=await snapshot(100);
 equal([snap.clients.length,snap.counts.clients,snap.truncated.clients],[1000,1001,true],'client cap is explicit, not a false complete count');
 equal([snap.activities.length,snap.counts.activities,snap.truncated.activities],[500,501,true],'history cap is explicit');
 await db.exec('RESET ROLE; ROLLBACK');
 equal(Number((await q('SELECT count(*) n FROM org_crm_clients')).rows[0].n),0,'all synthetic business changes rolled back');
 const report={passed:true,assertions,postchecks:expected.postchecks,atomicBundleTested:true,syntheticBusinessRowsRolledBack:true,liveApplied:false,mailSent:false,
  deletionPreviewValidation:'Exact original body plus four organization shared-record entries; contribution to blocker counted. Full legacy deletion workflow not executed in the isolated fixture.'};
 await writeFile(folder+'validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){console.error(JSON.stringify({passed:false,assertions,message:e.message,code:e.code,where:e.where,detail:e.detail}));process.exitCode=1;}
finally{await db.close();}
