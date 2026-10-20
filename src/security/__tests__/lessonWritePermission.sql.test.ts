// @vitest-environment node
// AUTHORED ONLY until a root-reviewed held run. No production or existing QA rows.
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it}from'vitest';
import type{PGlite}from'@electric-sql/pglite';
import {actor,createLessonWriteLab,id,migrationPath,read,scalar,type LabRole}from'./helpers/lessonWriteLab';
let db:PGlite;let paidAnchor:string;
type Attempt={coursesWrite:boolean;paidScope:boolean;visible:number;insert:number;update:number;delete:number;updatedContent:string|null;errors:string[];trusted:{inserted:number;original:number;validated:boolean}};
let baselineLearner:Attempt;let baselineExpired:Attempt;let baselinePositives:Record<string,Attempt>={};
let baselineBystander:Attempt;
let selectBefore:Record<string,string[]>;let originalCatalog:any;
const catalog=async()=>{
 await db.exec('RESET ROLE');
 return(await db.query<any>(`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'metadata',to_jsonb(p),'definition',pg_get_functiondef(p.oid))ORDER BY p.oid::regprocedure::text)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.proname<>'lesson_write_guard_allowed'AND p.prokind<>'a'),'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'table',polrelid::regclass::text,'cmd',polcmd,'roles',polroles,'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN('courses'::regclass,'lessons'::regclass)AND polname NOT IN('lesson_write_guard_insert','lesson_write_guard_update','lesson_write_guard_delete')),'tables',(SELECT jsonb_agg(jsonb_build_object('oid',oid,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity)ORDER BY oid)FROM pg_class WHERE oid IN('courses'::regclass,'lessons'::regclass)),'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)ORDER BY tgname)FROM pg_trigger WHERE tgrelid='lessons'::regclass AND NOT tgisinternal))AS value`)).rows[0].value;
};
async function selectMatrix(){
 const rows:Record<string,string[]>={};
 for(const n of [null,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]){await actor(db,n);rows[String(n)]=(await db.query<{id:string}>('SELECT id FROM lessons ORDER BY id')).rows.map(r=>r.id);}
 await db.exec('RESET ROLE');return rows;
}
async function attempt(n:number|null,databaseRole?:LabRole):Promise<Attempt>{
 await db.exec('RESET ROLE; SAVEPOINT one_attempt');await actor(db,n,databaseRole);
 const answer:Attempt={coursesWrite:await scalar<boolean>(db,"SELECT public.can_access_course($1,'courses.write')AS value",[id(301)]),paidScope:await scalar<boolean>(db,'SELECT public._paid_20260922_course_scope($1)AS value',[id(301)]),visible:(await db.query('SELECT id FROM courses WHERE id=$1',[id(301)])).rows.length,insert:0,update:0,delete:0,updatedContent:null,errors:[],trusted:{inserted:0,original:0,validated:true}};
 for(const [kind,sql,args]of[
  ['insert','INSERT INTO lessons(id,course_id,title,content,order_index)VALUES($1,$2,\'Synthetic attempted insert\',\'Only fixture content\',10)RETURNING id',[id(900),id(301)]],
  ['update','UPDATE lessons SET content=\'Synthetic attempted update\'WHERE id=$1 RETURNING id',[id(701)]],
  ['delete','DELETE FROM lessons WHERE id=$1 RETURNING id',[id(701)]],
 ]as const){
  await db.exec('SAVEPOINT one_statement');try{answer[kind]=(await db.query(sql,[...args])).rows.length;if(kind==='update'&&answer.update===1){await db.exec('RESET ROLE');answer.updatedContent=await scalar<string>(db,'SELECT content AS value FROM lessons WHERE id=$1',[id(701)]);await actor(db,n,databaseRole);}await db.exec('RELEASE SAVEPOINT one_statement');}catch(e:any){answer.errors.push(`${kind}:${String(e.code)}:${String(e.message)}`);await db.exec('ROLLBACK TO SAVEPOINT one_statement; RELEASE SAVEPOINT one_statement');}
 }
 await db.exec('RESET ROLE');answer.trusted={inserted:(await db.query('SELECT id FROM lessons WHERE id=$1',[id(900)])).rows.length,original:(await db.query('SELECT id FROM lessons WHERE id=$1',[id(701)])).rows.length,validated:await scalar<boolean>(db,'SELECT is_validated AS value FROM marketplace_courses WHERE id=$1',[id(801)])};
 await db.exec('ROLLBACK TO SAVEPOINT one_attempt; RELEASE SAVEPOINT one_attempt');return answer;
}
async function denied(fn:()=>Promise<unknown>,marker='42501'){
 await db.exec('SAVEPOINT denied_statement');let error:any;try{await fn();}catch(e){error=e;}await db.exec('ROLLBACK TO SAVEPOINT denied_statement; RELEASE SAVEPOINT denied_statement');
 expect(error,'An actual database rejection is required').toBeTruthy();expect(marker==='42501'?String(error?.code):String(error?.message)).toContain(marker);
}
beforeAll(async()=>{
 const lab=await createLessonWriteLab();db=lab.db;paidAnchor=lab.paidAnchor;
 await db.exec('BEGIN');
 baselineLearner=await attempt(4);baselineExpired=await attempt(5);
 // A deliberately granted extra non-BYPASS role must not retain the old ALL
 // path. Give it stronger claims than normal anon to make the denial meaningful.
 await db.exec('RESET ROLE; GRANT ALL ON courses,lessons TO lesson_fixture_default_grantee');
 baselineBystander=await attempt(4,'lesson_fixture_default_grantee');
 // Restore exact live table ACLs before the candidate's metadata preflight.
 await db.exec('RESET ROLE; REVOKE ALL ON courses,lessons FROM lesson_fixture_default_grantee');
 for(const n of [1,2,3,15,16])baselinePositives[String(n)]=await attempt(n);
 selectBefore=await selectMatrix();originalCatalog=await catalog();await db.exec('COMMIT');
 // Fail setup if the claimed baseline is not actually demonstrated. Skipped tests
 // on setup failure are not reported as reproduced coverage.
 if(baselineLearner.coursesWrite||baselineLearner.paidScope||baselineLearner.visible!==1||baselineLearner.insert!==1||baselineLearner.update!==1||baselineLearner.delete!==1||baselineLearner.trusted.inserted!==1||baselineLearner.trusted.original!==0)throw Error('NON_VACUOUS_BASELINE_REPRODUCTION_FAILED:'+JSON.stringify(baselineLearner));
 await db.exec('BEGIN');try{await db.exec(await read(migrationPath));await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}
},30000);
beforeEach(async()=>{await db.exec('RESET ROLE; BEGIN');await actor(db,1);});
afterEach(async()=>{await db?.exec('ROLLBACK; RESET ROLE');});
afterAll(async()=>{await db?.close();});
describe('Actual isolated lesson write RLS baseline and restrictive candidate',()=>{
 it('proves same-org learner writes succeeded despite courses.write=false, with actual paid scope false and trusted readback',()=>{
  expect(baselineLearner).toMatchObject({coursesWrite:false,paidScope:false,visible:1,insert:1,update:1,delete:1,updatedContent:'Synthetic attempted update',errors:[],trusted:{inserted:1,original:0,validated:false}});
 });
 it('proves expired same-profile staff also bypassed the correct old permission helper',()=>{
  expect(baselineExpired).toMatchObject({coursesWrite:false,paidScope:false,visible:1,insert:1,update:1,delete:1,errors:[]});
 });
 it('closes an otherwise granted default-bystander role, with a nonvacuous old-policy write proof',async()=>{
  expect(baselineBystander).toMatchObject({coursesWrite:false,paidScope:false,insert:1,update:1,delete:1,errors:[]});
  await db.exec('RESET ROLE; GRANT ALL ON courses,lessons TO lesson_fixture_default_grantee');
  const after=await attempt(4,'lesson_fixture_default_grantee');expect([after.insert,after.update,after.delete]).toEqual([0,0,0]);expect(after.trusted).toEqual({inserted:0,original:1,validated:true});
 });
 it('leaves trusted service-role BYPASS and database-owner operations explicit and unchanged',async()=>{
  expect(await attempt(null,'service_role')).toMatchObject({paidScope:false,insert:1,update:1,delete:1,errors:[]});
  await db.exec('RESET ROLE');expect((await db.query("INSERT INTO lessons(id,course_id,title)VALUES($1,$2,'Synthetic owner operation')RETURNING id",[id(920),id(301)])).rows).toEqual([{id:id(920)}]);
 });
 it.each([null,4,5,6,7,8,9,10,11,12,13,14,17,18])('denies all three writes for unauthorized/currently blocked actor %s without trusting rowcount zero alone',async n=>{
  const a=await attempt(n);expect(a.paidScope).toBe(false);expect([a.insert,a.update,a.delete]).toEqual([0,0,0]);expect(a.trusted).toEqual({inserted:0,original:1,validated:true});
  if(n!==null)expect(a.errors.some(e=>e.startsWith('insert:42501:'))).toBe(true);
 });
 it.each([1,2,3,15,16])('preserves actual visible owner/current staff/platform-admin writes for actor %s',async n=>{
  expect(baselinePositives[String(n)]).toMatchObject({coursesWrite:true,paidScope:false,visible:1,insert:1,update:1,delete:1});
  expect(await attempt(n)).toMatchObject({coursesWrite:true,paidScope:false,visible:1,insert:1,update:1,delete:1,errors:[],trusted:{inserted:1,original:0,validated:false}});
 });
 it('keeps every actual public/learner/staff catalogue SELECT result unchanged',async()=>{
  expect(await selectMatrix()).toEqual(selectBefore);
  expect(selectBefore.null).toContain(id(701));expect(selectBefore['4']).toContain(id(701));expect(selectBefore['4']).not.toContain(id(799));expect(selectBefore['8']).toEqual([]);
 });
 it('keeps the real paid original hidden from a nonbuyer and ordinary course scope genuinely neutral',async()=>{
  await actor(db,4);expect(await scalar(db,'SELECT public._paid_20260922_course_scope($1)AS value',[id(301)])).toBe(false);
  expect(await scalar(db,'SELECT public._paid_20260922_course_scope($1)AS value',[paidAnchor])).toBe(true);
  expect(await scalar(db,'SELECT public._paid_20260922_course_read($1,true)AS value',[paidAnchor])).toBe(false);
  expect((await db.query('SELECT id FROM lessons WHERE course_id=$1',[paidAnchor])).rows).toEqual([]);
 });
 it('checks BOTH old and new course authority for UPDATE reparenting',async()=>{
  // Actor3 may write A but has profile B; the old broad check could use that
  // profile for the new foreign course even though courses.write(B) is false.
  await actor(db,3);expect(await scalar(db,"SELECT can_access_course($1,'courses.write')AS value",[id(303)])).toBe(false);
  await denied(()=>db.query('UPDATE lessons SET course_id=$1 WHERE id=$2 RETURNING id',[id(303),id(701)]));
  expect((await db.query('UPDATE lessons SET course_id=$1 WHERE id=$2 RETURNING course_id',[id(302),id(701)])).rows).toEqual([{course_id:id(302)}]);
 });
 it('preserves legitimate builder INSERT RETURNING and UPSERT while denying learner conflict updates',async()=>{
  await actor(db,3);
  const sql="INSERT INTO lessons(id,course_id,title,content,order_index)VALUES($1,$2,'Synthetic builder import',$3,10)ON CONFLICT(id)DO UPDATE SET content=EXCLUDED.content RETURNING id,content";
  expect((await db.query(sql,[id(910),id(301),'First version'])).rows).toEqual([{id:id(910),content:'First version'}]);
  expect((await db.query(sql,[id(910),id(301),'Second version'])).rows).toEqual([{id:id(910),content:'Second version'}]);
  await actor(db,4);await denied(()=>db.query(sql,[id(910),id(301),'Learner overwrite']));
  await db.exec('RESET ROLE');expect((await db.query('SELECT content FROM lessons WHERE id=$1',[id(910)])).rows).toEqual([{content:'Second version'}]);
 });
 it('rechecks expiry/revocation on the next statement and fails closed for an absent course',async()=>{
  await actor(db,16);expect(await scalar(db,'SELECT lesson_write_guard_allowed($1)AS value',[id(301)])).toBe(true);
  await db.exec('RESET ROLE');await db.query('UPDATE org_staff SET expires_at=now()-interval \'1 second\'WHERE user_id=$1',[id(16)]);await actor(db,16);
  expect(await scalar(db,'SELECT lesson_write_guard_allowed($1)AS value',[id(301)])).toBe(false);
  await actor(db,3);expect(await scalar(db,'SELECT lesson_write_guard_allowed($1)AS value',[id(999)])).toBe(false);
  await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[id(3)]);await actor(db,3);
  await denied(()=>db.query("INSERT INTO lessons(course_id,title)VALUES($1,'Revoked write')",[id(301)]));
 });
 it('adds exactly three restrictive PUBLIC write policies and leaves every old function/ACL/SELECT/trigger unchanged',async()=>{
  expect(await catalog()).toEqual(originalCatalog);
  const policies=(await db.query("SELECT polname,polcmd::text,polpermissive,polroles=ARRAY[0::oid]public_role,polqual IS NOT NULL has_using,polwithcheck IS NOT NULL has_check FROM pg_policy WHERE polname IN('lesson_write_guard_insert','lesson_write_guard_update','lesson_write_guard_delete')ORDER BY polname")).rows;
  expect(policies).toEqual([{polname:'lesson_write_guard_delete',polcmd:'d',polpermissive:false,public_role:true,has_using:true,has_check:false},{polname:'lesson_write_guard_insert',polcmd:'a',polpermissive:false,public_role:true,has_using:false,has_check:true},{polname:'lesson_write_guard_update',polcmd:'w',polpermissive:false,public_role:true,has_using:true,has_check:true}]);
  expect((await db.query("SELECT has_function_privilege('anon','public.lesson_write_guard_allowed(uuid)','EXECUTE')anon,has_function_privilege('service_role','public.lesson_write_guard_allowed(uuid)','EXECUTE')service,has_function_privilege('lesson_fixture_default_grantee','public.lesson_write_guard_allowed(uuid)','EXECUTE')extra,has_function_privilege('authenticated','public.lesson_write_guard_allowed(uuid)','EXECUTE')authenticated")).rows).toEqual([{anon:false,service:false,extra:false,authenticated:true}]);
 });
});
