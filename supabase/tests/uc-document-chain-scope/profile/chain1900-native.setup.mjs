import {afterAll,afterEach,expect} from 'vitest';
import path from 'node:path';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.env.UC116_NATIVE_CHECKOUT,output=process.env.UC116_NATIVE_OUTPUT,password=process.env.UC116_NATIVE_PASSWORD;
if(!root||!output||!password)throw Error('Explicit isolated full-cycle native context required');
// Read-only local input tracing for a finite reproducible fixture package. No content or secrets are reported.
const observedInputs=new Map(),originalReadFileSync=fs.readFileSync.bind(fs);
fs.readFileSync=function(file,...args){const value=originalReadFileSync(file,...args);const filename=typeof file==='string'?path.resolve(file):null;const base=path.resolve(root)+path.sep;if(filename?.startsWith(base)&&!filename.includes(path.sep+'node_modules'+path.sep)){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');observedInputs.set(path.relative(root,filename).replaceAll('\\','/'),{relative:path.relative(root,filename).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}return value;};syncBuiltinESMExports();

const contract=JSON.parse(readFileSync(path.join(import.meta.dirname,'profile-contract.json'),'utf8'));
const require=createRequire(path.join(root,'package.json'));const postgres=require('postgres');
const nativeTypes={nativeTimestamptz:{to:1184,from:[1184],parse:x=>x,serialize:x=>x},nativeTimestamp:{to:1114,from:[1114],parse:x=>x,serialize:x=>x},nativeJson:{to:114,from:[114],parse:JSON.parse,serialize:x=>typeof x==='string'?x:JSON.stringify(x)},nativeJsonb:{to:3802,from:[3802],parse:JSON.parse,serialize:x=>typeof x==='string'?x:JSON.stringify(x)}};
const options={host:'127.0.0.1',port:Number(process.env.B1_NATIVE_PORT),username:'postgres',password,max:1,prepare:false,ssl:false,connect_timeout:8,idle_timeout:0,max_lifetime:null,types:nativeTypes,onnotice:()=>{},connection:{statement_timeout:60000,lock_timeout:12000,idle_in_transaction_session_timeout:90000}};
const admin=postgres({...options,database:'postgres',connection:{...options.connection,application_name:'uc_full_cycle_native_admin'}});
const fixtureRoles=['authenticated','anon','service_role','sandbox_exec_atxwvjxbqjgkbjlhsdch','sandbox_exec'];
const roleSql='SELECT oid::text oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil::text valid_until,rolbypassrls,rolconfig FROM pg_roles ORDER BY oid';
const membershipSql='SELECT to_jsonb(m) metadata FROM pg_auth_members m ORDER BY roleid,member,grantor';
const settingsSql='SELECT setdatabase::text database_oid,setrole::text role_oid,setconfig FROM pg_db_role_setting ORDER BY setdatabase,setrole';
const check=(ok,message)=>{if(!ok)throw Error('UC_FULL_CYCLE_NATIVE_FENCE:'+message);};
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const safeName=s=>{check(/^[a-z0-9_]{1,63}$/.test(s),'bounded synthetic identifier');return s;};
const hash=x=>createHash('sha256').update(x).digest('hex');
const stats={status:'RUNNING',scope:'One new CHAIN1900 PostgreSQL17.11 retained-draft scope regression; no old full workflow/cloud/browser/production acceptance.',driver:JSON.parse(readFileSync(path.join(root,'node_modules/postgres/package.json'),'utf8')).version,queries:0,execs:0,sqlErrors:[],databases:[],typeRules:['OID1114/1184 identity strings preserve microseconds.','OID114/3802 JSON encoded strings unchanged, other values JSON.stringify and results JSON.parse.','Only constructor seam replaced: no SQL, argument, actor, source guard or assertion rewrites.']};
const progress=()=>writeFileSync(path.join(output,'native-adapter-progress.json'),JSON.stringify(stats,null,2)+'\n');
const [environment]=await admin.unsafe("SELECT current_setting('server_version')version,current_setting('data_directory')data_directory,current_setting('listen_addresses')listen_addresses,current_setting('port')port,current_user installer,pg_backend_pid()backend_pid");
check(environment.version.startsWith('17.11')&&environment.listen_addresses==='*'&&environment.port==='55483'&&environment.installer==='postgres'&&typeof process.env.UC116_NATIVE_DATA==='string'&&environment.data_directory===process.env.UC116_NATIVE_DATA&&process.env.B1_NATIVE_HOST_BINDING==='127.0.0.1','exact owned Linux PostgreSQL17 identity');
check(stats.driver==='3.4.9','held postgres3.4.9 driver');stats.environment=environment;
const rolesBefore=Array.from(await admin.unsafe(roleSql)),membershipsBefore=Array.from(await admin.unsafe(membershipSql)),settingsBefore=Array.from(await admin.unsafe(settingsSql));
check(!rolesBefore.some(r=>fixtureRoles.includes(r.rolname)),'all five fresh fixture roles absent');
stats.rolesBefore=rolesBefore;stats.membershipsBefore=membershipsBefore;stats.roleSettingsBefore=settingsBefore;stats.expectedFreshRoles=fixtureRoles;
const active=new Set(),seenCases=new Set();let created=0;
globalThis.__uc116CreateNativeFixture=()=>{
 const title=expect.getState().currentTestName;
 const caseId=/^(CHAIN1900) /.exec(title??'')?.[1];
 check(caseId&&contract.cases.some(c=>c.id===caseId&&c.title===title)&&!seenCases.has(caseId),'one fixture for exact bound full-cycle case title');seenCases.add(caseId);
 check(stats.databases.every(d=>d.closed&&d.status==='CLEANED'),'previous case database and roles cleaned');check(++created<=contract.expectedDatabases&&created<=27,'bounded native fixture count');
 const name=safeName('uc116_case_'+String(created).padStart(3,'0'));const record={name,caseId,title,status:'INITIALIZING',closed:false,connections:[]};stats.databases.push(record);progress();
 const clients=new Set();let closePromise=null;
 const ready=(async()=>{check(JSON.stringify(Array.from(await admin.unsafe(roleSql)))===JSON.stringify(rolesBefore),'cluster roles unchanged before fresh database');await admin.unsafe('CREATE DATABASE '+quote(name));record.status='CREATED';progress();})();
 const connect=label=>{
  check(!closePromise,'no connection while fixture closes');safeName(label);check(record.connections.length<2&&!record.connections.some(c=>c.label===label),'bounded unique connection labels');
  const sql=postgres({...options,database:name,connection:{...options.connection,application_name:'ucfc_'+label}});
  const connection={label,pid:null,closed:false};record.connections.push(connection);clients.add({sql,record:connection});
  const run=async(text,args=[],exec=false)=>{
   check(!closePromise,'fixture not closing');await ready;if(connection.pid===null){const[p]=await sql.unsafe('SELECT pg_backend_pid()pid');connection.pid=p.pid;}
   if(exec)stats.execs++;else stats.queries++;
   connection.lastStatement={atUtc:new Date().toISOString(),sha256:hash(text),preview:text.slice(0,240),argumentCount:args.length};
   try{const result=await sql.unsafe(text,args);return exec?result:{rows:Array.from(result)};}
   catch(e){stats.sqlErrors.push({caseId,case:name,connection:label,code:e.code??null,position:e.position??null,internalPosition:e.internal_position??null,routine:e.routine??null,message:String(e.message).slice(0,200),lastStatement:connection.lastStatement});check(stats.sqlErrors.length<=300,'bounded SQL error records');progress();throw e;}
  };
  return {exec:text=>run(text,[],true),query:(text,args=[])=>run(text,args,false),pid:async()=>{if(connection.pid===null)await run('SELECT 1');return connection.pid;},label};
 };
 const primary=connect('fixture_1');
 const cryptoReady=ready.then(async()=>{
  await primary.exec('CREATE EXTENSION pgcrypto');
  const{rows:[probe]}=await primary.query("SELECT extversion version,encode(digest('uc-full-cycle-native-probe','sha256'),'hex')digest FROM pg_extension WHERE extname='pgcrypto'");
  check(probe.digest===hash('uc-full-cycle-native-probe'),'real native pgcrypto');
  const{rows:[types]}=await primary.query("SELECT '2026-10-21 00:00:00.123456+00'::timestamptz instant,'2026-10-21 00:00:00.123456'::timestamp local_instant,'{\"native\":true}'::jsonb json_probe");
  check(typeof types.instant==='string'&&types.instant.includes('.123456')&&typeof types.local_instant==='string'&&types.local_instant.includes('.123456')&&types.json_probe?.native===true,'native microseconds and JSON representation');
  record.pgcrypto={version:probe.version,sha256Matches:true};record.microseconds=types.instant;record.jsonParserPreserved=true;record.status='READY';progress();
 });
 const close=()=>{
  if(closePromise)return closePromise;
  closePromise=(async()=>{
   record.cleanupPhase='close_captured_connections';progress();await ready.catch(()=>{});await cryptoReady.catch(()=>{});
   const closed=await Promise.allSettled([...clients].map(async c=>{await c.sql.end({timeout:3});c.record.closed=true;}));check(closed.every(r=>r.status==='fulfilled'),'all captured own clients closed');
   record.cleanupPhase='drop_own_database';progress();if(record.status!=='INITIALIZING')await admin.unsafe('DROP DATABASE '+quote(name));
   record.cleanupPhase='drop_only_initially_absent_roles';progress();for(const role of fixtureRoles)await admin.unsafe('DROP ROLE IF EXISTS '+quote(role));
   const rolesAfter=Array.from(await admin.unsafe(roleSql)),membershipsAfter=Array.from(await admin.unsafe(membershipSql)),settingsAfter=Array.from(await admin.unsafe(settingsSql));
   stats.rolesAfter=rolesAfter;stats.membershipsAfter=membershipsAfter;stats.roleSettingsAfter=settingsAfter;
   check(JSON.stringify(rolesAfter)===JSON.stringify(rolesBefore)&&JSON.stringify(membershipsAfter)===JSON.stringify(membershipsBefore)&&JSON.stringify(settingsAfter)===JSON.stringify(settingsBefore),'cluster roles/membership/settings exactly restored');
   record.closed=true;record.status='CLEANED';record.cleanupPhase='complete';stats.rolesRestored=true;active.delete(close);progress();
  })();return closePromise;
 };
 active.add(close);return {async exec(text){await cryptoReady;return primary.exec(text);},async query(text,args=[]){await cryptoReady;return primary.query(text,args);},close,native:{connect,record,name}};
};
afterEach(async()=>{for(const close of [...active])await close();},30000);
afterAll(async()=>{
 try{for(const close of [...active])await close();check(created===contract.expectedDatabases&&stats.databases.length===contract.expectedDatabases&&seenCases.size===contract.expectedCases&&stats.databases.every(d=>d.closed&&d.status==='CLEANED')&&stats.rolesRestored,'exact complete cases/database/role cleanup');stats.status='PASS';}
 catch(e){stats.status='FAIL';stats.cleanupFailure=String(e.message).slice(0,1000);}
 finally{await admin.end({timeout:5});writeFileSync(path.join(output,'native-adapter.json'),JSON.stringify(stats,null,2)+'\n');writeFileSync(path.join(output,'actual-native-input-reads.json'),JSON.stringify({scope:'READONLY_ACTUAL_LOCAL_FILE_INPUTS_HASHES_ONLY',inputs:[...observedInputs.values()].sort((a,b)=>a.relative.localeCompare(b.relative))},null,2)+'\n');fs.readFileSync=originalReadFileSync;syncBuiltinESMExports();}
},30000);
