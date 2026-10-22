// @vitest-environment node
// Source-authored regression suite. Native concurrency requires the separately
// reviewed PostgreSQL17 constructor seam; a PGlite run is not native acceptance.
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {asQuotaActor as actor,createMonthlyQuotaFixture,quotaId as id,quotaMigration,quotaMigrationBody,installQuotaMigration,quotaRow as row,seedQuotaOrganization,type QuotaDb,type QuotaConnection} from '../../functions/_shared/monthly-course-quota.fixture';
const org=id(1),owner=id(20),learner=id(10),second=id(11),third=id(12),course=id(30),course2=id(31),course3=id(32);
const legacyOrg=id(900),legacyUser=id(901),legacyCompleted=id(904),legacyCourse=id(930),legacyCompletedCourse=id(934);
const enroll=async(db:QuotaConnection,user=learner,c=course,status='active')=>row(db,'INSERT INTO enrollments(user_id,course_id,status)VALUES($1,$2,$3) RETURNING id',[user,c,status]);
const capacity=async(db:QuotaConnection,o=org)=>row(db,'SELECT * FROM get_organization_student_capacity($1,1)',[o]);
const training=async(db:QuotaConnection,o=org)=>row(db,'SELECT * FROM get_organization_training_capacity($1,1)',[o]);
async function rejected(db:QuotaConnection,sql:string,args:any[]=[],detail='STUDENT_ASSIGNMENT_LIMIT_EXCEEDED',code='P0001'){
 await db.exec('SAVEPOINT expected_rejection');let error:any;
 try{await db.query(sql,args);}catch(e){error=e;}
 await db.exec('ROLLBACK TO expected_rejection;RELEASE expected_rejection');
 expect(error,'A real database rejection is required').toBeTruthy();expect(error.code).toBe(code);
 if(detail)expect(error.detail??error.details).toBe(detail);
}
async function profile(db:QuotaConnection,user:string,group:string|null=null){
 return row(db,'SELECT create_student_profile_with_capacity($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',
  [org,user,'Synthetic personal file',null,null,null,null,group,null]);
}
async function installLegacy(db:QuotaDb){
 await db.query("INSERT INTO organizations(id,name,email,subscription_plan)VALUES($1,'Synthetic historic organization','historic@example.invalid','start')",[legacyOrg]);
 for(const n of [901,902,903,904]){
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[id(n)]);
  await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic historic learner')",[id(n),legacyOrg]);
  await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'student')",[id(n)]);
 }
 for(const n of [930,931,932,934])await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Synthetic historic course')",[id(n),legacyOrg]);
 await db.query("INSERT INTO enrollments(user_id,course_id,started_at)VALUES($1,$2,date_trunc('month',now())-interval '1 month')",[legacyUser,legacyCourse]);
 await db.query("UPDATE enrollment_history SET created_at=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'-interval '1 day' WHERE user_id=$1",[legacyUser]);
 await enroll(db,id(902),id(931));await db.query('DELETE FROM enrollments WHERE user_id=$1',[id(902)]);
 await db.query("INSERT INTO enrollments(user_id,course_id,status,completed_at)VALUES($1,$2,'completed',now())",[id(903),id(932)]);
 await db.query("INSERT INTO enrollments(user_id,course_id,status,completed_at)VALUES($1,$2,'completed',now()-interval '2 months')",[legacyCompleted,legacyCompletedCourse]);
 await db.query("UPDATE enrollment_history SET created_at=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'-interval '1 day' WHERE user_id=$1",[legacyCompleted]);
 // Accepted facts over a newly configured limit are not rejected by migration.
 await db.query('UPDATE organizations SET custom_max_students=1,custom_max_trained_per_month=0 WHERE id=$1',[legacyOrg]);
}

describe('Authoritative monthly assignment and completion quotas',()=>{
 let db:QuotaDb;let originalPublicAcl:any[];
 beforeAll(async()=>{
  db=await createMonthlyQuotaFixture(false);await installLegacy(db);
  originalPublicAcl=(await db.query("SELECT oid::regprocedure::text signature,proacl::text acl,prosecdef,provolatile,proconfig FROM pg_proc WHERE oid IN('get_organization_student_capacity(uuid,integer)'::regprocedure,'create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)'::regprocedure,'account_deletion_personal_row_counts(uuid)'::regprocedure,'account_deletion_erase_data(uuid,text)'::regprocedure) ORDER BY 1")).rows;
  await installQuotaMigration(db);
 },30000);
 beforeEach(async()=>{await db.exec('RESET ROLE;BEGIN');await seedQuotaOrganization(db);});
 afterEach(async()=>db.exec('ROLLBACK;RESET ROLE'));
 afterAll(async()=>db?.close());

 it('preserves existing public ACL/security attributes and private default-grant fences',async()=>{
  await db.exec('RESET ROLE');
  expect((await db.query("SELECT oid::regprocedure::text signature,proacl::text acl,prosecdef,provolatile,proconfig FROM pg_proc WHERE oid IN('get_organization_student_capacity(uuid,integer)'::regprocedure,'create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)'::regprocedure,'account_deletion_personal_row_counts(uuid)'::regprocedure,'account_deletion_erase_data(uuid,text)'::regprocedure) ORDER BY 1")).rows).toEqual(originalPublicAcl);
  expect((await row(db,"SELECT count(*)::integer n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('organization_monthly_course_usage','organization_monthly_student_assignments','organization_monthly_training_completions') AND c.relrowsecurity")).n).toBe(3);
  for(const role of ['anon','authenticated','service_role','lesson_fixture_default_grantee'])for(const table of ['organization_monthly_course_usage','organization_monthly_student_assignments','organization_monthly_training_completions']){
   expect((await row(db,"SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed",[role,'public.'+table])).allowed).toBe(false);
  }
  expect((await row(db,"SELECT has_function_privilege('authenticated','_organization_monthly_course_limits(uuid)','EXECUTE') allowed")).allowed).toBe(false);
  await actor(db,owner);await rejected(db,'SELECT * FROM organization_monthly_course_usage',[],'','42501');
  await rejected(db,'TRUNCATE organization_monthly_course_usage',[],'','42501');
 });

 it('keeps owner/staff authorization and rejects stale expired staff and foreign learners',async()=>{
  expect((await capacity(db)).current_students).toBe(0);expect((await training(db)).current_trainings).toBe(0);
  await actor(db,second);await rejected(db,'SELECT * FROM get_organization_student_capacity($1,1)',[org],'','42501');
  await rejected(db,'SELECT * FROM get_organization_training_capacity($1,1)',[org],'','42501');
  await db.exec('RESET ROLE');await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom',$3::jsonb)",[id(21),org,JSON.stringify(['students.read'])]);
  await actor(db,id(21));expect((await capacity(db)).max_students).toBe(2);
  await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET expires_at=now()-interval '1 second' WHERE user_id=$1",[id(21)]);
  await actor(db,id(21));await rejected(db,'SELECT * FROM get_organization_student_capacity($1,1)',[org],'','42501');
 });

 it.each([['free',10,10],['start',100,60],['standard',200,100],['professional',-1,-1],['maximum',-1,-1]])('uses canonical plan %s quotas',async(plan,students,trainings)=>{
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET subscription_plan=$1,custom_max_students=NULL,custom_max_trained_per_month=NULL WHERE id=$2',[plan,org]);
  await actor(db,owner);expect((await capacity(db)).max_students).toBe(students);expect((await training(db)).max_trainings).toBe(trainings);
 });

 it('preserves custom unlimited and active postpaid limits without changing contract facts',async()=>{
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET custom_max_students=-1,custom_max_trained_per_month=-1 WHERE id=$1',[org]);
  await actor(db,owner);expect((await capacity(db)).is_unlimited).toBe(true);expect((await training(db)).limit_source).toBe('custom');
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET custom_max_students=0,custom_max_trained_per_month=0 WHERE id=$1',[org]);
  await db.query("INSERT INTO organization_billing_agreements(organization_id,effective_from,contract_reference,customer_confirmation,created_by)VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date,'Synthetic contract','Synthetic confirmation only',$2)",[org,owner]);
  const before=await row(db,'SELECT to_jsonb(a) facts FROM organization_billing_agreements a WHERE organization_id=$1',[org]);
  await actor(db,owner);expect((await capacity(db)).limit_source).toBe('postpaid');expect((await training(db)).max_trainings).toBe(-1);
  await enroll(db);await db.query("UPDATE enrollments SET status='completed' WHERE user_id=$1",[learner]);
  await db.exec('RESET ROLE');expect(await row(db,'SELECT to_jsonb(a) facts FROM organization_billing_agreements a WHERE organization_id=$1',[org])).toEqual(before);
 });

 it('ignores future and expired postpaid agreements',async()=>{
  await db.exec('RESET ROLE');await db.query("INSERT INTO organization_billing_agreements(organization_id,effective_from,contract_reference,customer_confirmation,created_by)VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date+1,'Synthetic future','Synthetic confirmation only',$2)",[org,owner]);
  await actor(db,owner);expect((await capacity(db)).max_students).toBe(2);
  await db.exec('RESET ROLE');await db.query("UPDATE organization_billing_agreements SET effective_from=(now() AT TIME ZONE 'Europe/Moscow')::date-2,effective_to=(now() AT TIME ZONE 'Europe/Moscow')::date WHERE organization_id=$1",[org]);
  await actor(db,owner);expect((await training(db)).max_trainings).toBe(2);
 });

 it('creates more personal files than monthly slots and leaves the historical intake counter unchanged',async()=>{
  await db.exec('RESET ROLE');await db.query("INSERT INTO organization_usage(organization_id,month_start,students_added_count)VALUES($1,date_trunc('month',now() AT TIME ZONE 'Europe/Moscow')::date,999)",[org]);
  for(const n of [100,101,102,103,104]){
   await db.query('INSERT INTO auth.users(id)VALUES($1)',[id(n)]);await actor(db,null,'service_role');
   const result=(await profile(db,id(n))).result;expect(result.success).toBe(true);expect(result.current_students).toBe(0);expect(result.profile_persisted).toBe(true);await db.exec('RESET ROLE');
  }
  expect((await row(db,'SELECT students_added_count FROM organization_usage WHERE organization_id=$1',[org])).students_added_count).toBe(999);
  await actor(db,owner);expect((await capacity(db)).current_students).toBe(0);
 });

 it('counts distinct assigned learners, not records or the number of assigned courses',async()=>{
  await enroll(db);await enroll(db,learner,course2);expect((await capacity(db)).current_students).toBe(1);
  await enroll(db,second,course);expect((await capacity(db)).can_add).toBe(false);
  await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$2)',[third,course]);
  await enroll(db,learner,course3);expect((await capacity(db)).current_students).toBe(2);
 });

 it('keeps profile edits and archived-file rejection independent from assignment capacity',async()=>{
  await enroll(db);await enroll(db,second,course);await actor(db,null,'service_role');
  expect((await profile(db,third)).result.success).toBe(true);
  await db.query('UPDATE profiles SET archived_at=now() WHERE user_id=$1',[third]);
  expect((await profile(db,third)).result.code).toBe('STUDENT_ARCHIVED');
  await db.exec('RESET ROLE');expect((await row(db,'SELECT archived_at IS NOT NULL archived FROM profiles WHERE user_id=$1',[third])).archived).toBe(true);
 });

 it('preserves a new personal file and role when automatic group enrollment reaches the quota',async()=>{
  await enroll(db);await enroll(db,second,course);await db.exec('RESET ROLE');
  await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic quota group')",[id(40),org,course2]);
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[id(100)]);await actor(db,null,'service_role');
  const result=(await profile(db,id(100),id(40))).result;expect(result.success).toBe(true);expect(result.group_assignment_confirmed).toBe(false);expect(result.current_students).toBe(2);
  await db.exec('RESET ROLE');expect((await row(db,'SELECT student_group_id FROM profiles WHERE user_id=$1',[id(100)])).student_group_id).toBeNull();
  expect((await row(db,'SELECT count(*)::integer n FROM user_roles WHERE user_id=$1',[id(100)])).n).toBe(1);
  expect((await row(db,'SELECT count(*)::integer n FROM enrollments WHERE user_id=$1',[id(100)])).n).toBe(0);
 });

 it('rolls back an entire over-capacity bulk assignment including history and counters',async()=>{
  await enroll(db);await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$3),($2,$3)',[second,third,course]);
  expect((await capacity(db)).current_students).toBe(1);
  expect((await row(db,'SELECT count(*)::integer n FROM enrollments WHERE user_id IN($1,$2)',[second,third])).n).toBe(0);
  expect((await row(db,'SELECT count(*)::integer n FROM enrollment_history WHERE user_id IN($1,$2)',[second,third])).n).toBe(0);
 });

 it('deduplicates same-learner bulk assignments and successful ON CONFLICT no-ops',async()=>{
  await db.query('INSERT INTO enrollments(user_id,course_id)VALUES($1,$2),($1,$3)',[learner,course,course2]);
  await db.query('INSERT INTO enrollments(user_id,course_id)VALUES($1,$2) ON CONFLICT(user_id,course_id) DO NOTHING',[learner,course]);
  await db.query('INSERT INTO enrollments(user_id,course_id)VALUES($1,$2) ON CONFLICT(user_id,course_id) DO UPDATE SET time_spent=enrollments.time_spent+1',[learner,course]);
  expect((await capacity(db)).current_students).toBe(1);
 });

 it('does not charge a failed unique insert or a failed course foreign key',async()=>{
  await enroll(db);await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$2)',[learner,course],'','23505');
  await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$2)',[second,id(9999)],'','23503');
  expect((await capacity(db)).current_students).toBe(1);
 });

 it('does not refund a slot after enrollment deletion, course deletion or archiving',async()=>{
  await enroll(db);await enroll(db,second,course2);
  await db.query('DELETE FROM enrollments WHERE user_id=$1 OR course_id=$2',[learner,course2]);await db.query('DELETE FROM courses WHERE id=$1',[course2]);
  await db.query('UPDATE profiles SET archived_at=now() WHERE user_id=$1',[second]);
  expect((await capacity(db)).current_students).toBe(2);
  await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$2)',[third,course]);
  await enroll(db,learner,course);expect((await capacity(db)).current_students).toBe(2);
 });

 it('preserves the actual account-deletion write fence before any quota charge',async()=>{
  await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[learner]);await actor(db,owner);
  await rejected(db,'INSERT INTO enrollments(user_id,course_id)VALUES($1,$2)',[learner,course],'','42501');
  expect((await capacity(db)).current_students).toBe(0);
 });

 it('backfills trusted current-month history even for a removed enrollment and preserves over-limit accepted facts',async()=>{
  await actor(db,null,'service_role');const c=await capacity(db,legacyOrg),t=await training(db,legacyOrg);
  expect(c.current_students).toBe(2);expect(c.max_students).toBe(1);expect(t.current_trainings).toBe(1);expect(t.max_trainings).toBe(0);
 });

 it('does not count continued study, first-start initialization or automatic reopening as assignment',async()=>{
  await actor(db,null,'service_role');await db.query('UPDATE enrollments SET progress=25,time_spent=7 WHERE user_id=$1 AND course_id=$2',[legacyUser,legacyCourse]);
  await db.query("UPDATE enrollments SET status='active',progress=0,completed_at=NULL WHERE user_id=$1 AND course_id=$2",[legacyCompleted,legacyCompletedCourse]);
  expect((await capacity(db,legacyOrg)).current_students).toBe(2);
  // The production column is NOT NULL, so NULL->first-start cannot occur in
  // this captured schema. The source condition still excludes that transition.
  expect((await readFile(quotaMigration,'utf8'))).toContain('OLD.started_at IS NOT NULL AND NEW.started_at>OLD.started_at');
 });

 it('charges an actual renewed historic assignment in this month, once even after more access edits',async()=>{
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET custom_max_students=10 WHERE id=$1',[legacyOrg]);
  await actor(db,null,'service_role');await db.query('UPDATE enrollments SET started_at=now(),access_days=30 WHERE user_id=$1 AND course_id=$2',[legacyUser,legacyCourse]);
  expect((await capacity(db,legacyOrg)).current_students).toBe(3);
  await db.query('UPDATE enrollments SET access_days=60 WHERE user_id=$1 AND course_id=$2',[legacyUser,legacyCourse]);
  expect((await capacity(db,legacyOrg)).current_students).toBe(3);
 });

 it('does not trust a client-backdated started_at to bypass the current-month quota',async()=>{
  await db.query("INSERT INTO enrollments(user_id,course_id,started_at)VALUES($1,$2,now()-interval '2 months')",[learner,course]);
  expect((await capacity(db)).current_students).toBe(1);
 });

 it('counts two completed courses as two trainings but one assigned learner',async()=>{
  await enroll(db);await enroll(db,learner,course2);
  await db.query("UPDATE enrollments SET status='completed',completed_at=now() WHERE user_id=$1",[learner]);
  expect((await capacity(db)).current_students).toBe(1);expect((await training(db)).current_trainings).toBe(2);
  await db.query("UPDATE enrollments SET status='active',progress=0,completed_at=NULL WHERE user_id=$1",[learner]);
  await db.query("UPDATE enrollments SET status='completed',completed_at=now() WHERE user_id=$1",[learner]);
  expect((await training(db)).current_trainings).toBe(2);
 });

 it('blocks direct completion beyond the training cap without charging a new assignment',async()=>{
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET custom_max_trained_per_month=1 WHERE id=$1',[org]);await actor(db,owner);
  await enroll(db);await db.query('UPDATE enrollments SET progress=100 WHERE user_id=$1',[learner]);
  await rejected(db,"INSERT INTO enrollments(user_id,course_id,status)VALUES($1,$2,'completed')",[second,course2],'TRAINING_COMPLETION_LIMIT_EXCEEDED');
  expect((await capacity(db)).current_students).toBe(1);expect((await training(db)).current_trainings).toBe(1);
 });

 it('enforces the completion gate inside the real complete-own-course RPC and rolls back failed lesson progress',async()=>{
  await db.exec('RESET ROLE');await db.query('UPDATE organizations SET custom_max_trained_per_month=1 WHERE id=$1',[org]);await actor(db,owner);
  const first=await enroll(db);const next=await enroll(db,learner,course2);
  await db.query("INSERT INTO lessons(id,course_id,title,type)VALUES($1,$2,'Synthetic test','test'),($3,$4,'Synthetic second test','test')",[id(60),course,id(61),course2]);
  await db.query("INSERT INTO test_attempts(user_id,lesson_id,score,max_score,passed,completed_at)VALUES($1,$2,10,10,true,now()),($1,$3,10,10,true,now())",[learner,id(60),id(61)]);
  await actor(db,learner);const completed=await row(db,'SELECT complete_own_course_enrollment($1) AS result',[first.id]);expect(completed.result.status).toBe('completed');
  await rejected(db,'SELECT complete_own_course_enrollment($1)',[next.id],'TRAINING_COMPLETION_LIMIT_EXCEEDED');
  expect((await row(db,'SELECT progress,status FROM enrollments WHERE id=$1',[next.id])).status).toBe('active');
  expect((await row(db,'SELECT count(*)::integer n FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2',[learner,id(61)])).n).toBe(0);
  await actor(db,owner);expect((await training(db)).current_trainings).toBe(1);
 });

 it('retains training usage when completed learning data is deleted',async()=>{
  await enroll(db);await db.query("UPDATE enrollments SET status='completed' WHERE user_id=$1",[learner]);
  await db.query('DELETE FROM enrollments WHERE course_id=$1',[course]);await db.query('DELETE FROM courses WHERE id=$1',[course]);expect((await training(db)).current_trainings).toBe(1);
 });

 it('scrubs quota user references on Auth erasure while keeping anonymous counters and exact privacy patches',async()=>{
  await enroll(db);await db.query("UPDATE enrollments SET status='completed' WHERE user_id=$1",[learner]);await db.exec('RESET ROLE');
  expect((await row(db,"SELECT md5(prosrc) hash FROM pg_proc WHERE oid='account_deletion_personal_row_counts(uuid)'::regprocedure")).hash).toBe('9618b4a8bff587b999b72cb69f6ed175');
  expect((await row(db,"SELECT md5(prosrc) hash FROM pg_proc WHERE oid='account_deletion_erase_data(uuid,text)'::regprocedure")).hash).toBe('a7e52857e79c16f3b9eec047bcb2fdf8');
  await db.query('DELETE FROM auth.users WHERE id=$1',[learner]);
  expect((await row(db,'SELECT count(*)::integer n FROM organization_monthly_student_assignments WHERE user_id=$1',[learner])).n).toBe(0);
  expect((await row(db,'SELECT count(*)::integer n FROM organization_monthly_training_completions WHERE user_id=$1',[learner])).n).toBe(0);
  await actor(db,owner);expect((await capacity(db)).current_students).toBe(1);expect((await training(db)).current_trainings).toBe(1);
 });

 it('fails closed when a pinned function baseline has changed',async()=>{
  await db.exec('RESET ROLE;SAVEPOINT migration_retry');let error:any;
  try{await db.exec(await quotaMigrationBody());}catch(e){error=e;}
  // Only the raw/body-pinned outer transaction framing is removed; every
  // preflight guard and SQL statement remains exact, inside this savepoint.
  await db.exec('ROLLBACK TO migration_retry;RELEASE migration_retry');
  expect(String(error?.message)).toContain('Monthly assignment baseline changed');
 });
});

async function waitForQuotaLock(db:QuotaConnection,pid:number){
 const until=Date.now()+2000;
 while(Date.now()<until){
  const state=await row(db,'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
  if(state?.wait_event_type==='Lock')return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('The captured competing backend did not reach a real PostgreSQL lock wait');
}
const native=typeof(globalThis as any).__lessonCreateNativeFixture==='function';
describe.skipIf(!native)('PostgreSQL17 two-session quota races',()=>{
 let db:QuotaDb;let a:QuotaConnection;let b:QuotaConnection;
 beforeAll(async()=>{db=await createMonthlyQuotaFixture();a=db.native!.connect('quota_race_a');b=db.native!.connect('quota_race_b');},30000);
 beforeEach(async()=>{await seedQuotaOrganization(db,org,1,1);await db.exec('RESET ROLE');});
 afterEach(async()=>{await a.exec('ROLLBACK;RESET ROLE');await b.exec('ROLLBACK;RESET ROLE');await db.exec('RESET ROLE;DELETE FROM enrollments;DELETE FROM enrollment_history;DELETE FROM profiles;DELETE FROM user_roles;DELETE FROM organizations;DELETE FROM auth.users');});
 afterAll(async()=>db?.close());

 it('serializes different learners competing for the final assignment slot',async()=>{
  await a.exec('BEGIN');await b.exec('BEGIN');await actor(a,owner);await actor(b,owner);
  await enroll(a,learner,course);
  const competingPid=(await row(b,'SELECT pg_backend_pid() pid')).pid;
  let settled=false;const pending=enroll(b,second,course).then(()=>({ok:true,error:null}),error=>({ok:false,error})).finally(()=>{settled=true;});
  await waitForQuotaLock(db,competingPid);expect(settled).toBe(false);await a.exec('COMMIT');
  const result=await pending;expect(result.ok).toBe(false);expect((result.error as any)?.detail).toBe('STUDENT_ASSIGNMENT_LIMIT_EXCEEDED');await b.exec('ROLLBACK');
  await actor(db,owner);expect((await capacity(db)).current_students).toBe(1);
 });

 it('deduplicates the same learner assigned different courses concurrently at a full quota',async()=>{
  await a.exec('BEGIN');await b.exec('BEGIN');await actor(a,owner);await actor(b,owner);
  await enroll(a,learner,course);const competingPid=(await row(b,'SELECT pg_backend_pid() pid')).pid;
  const pending=enroll(b,learner,course2);await waitForQuotaLock(db,competingPid);await a.exec('COMMIT');await pending;await b.exec('COMMIT');
  await actor(db,owner);expect((await capacity(db)).current_students).toBe(1);
  expect((await row(db,'SELECT count(*)::integer n FROM enrollments WHERE user_id=$1',[learner])).n).toBe(2);
 });

 it('serializes course completions competing for the final training slot',async()=>{
  await enroll(db,learner,course);await enroll(db,learner,course2);
  await a.exec('BEGIN');await b.exec('BEGIN');await actor(a,owner);await actor(b,owner);
  await a.query("UPDATE enrollments SET status='completed' WHERE user_id=$1 AND course_id=$2",[learner,course]);
  const competingPid=(await row(b,'SELECT pg_backend_pid() pid')).pid;
  const pending=b.query("UPDATE enrollments SET status='completed' WHERE user_id=$1 AND course_id=$2",[learner,course2]).then(()=>({ok:true,error:null}),error=>({ok:false,error}));
  await waitForQuotaLock(db,competingPid);await a.exec('COMMIT');const result=await pending;expect(result.ok).toBe(false);expect((result.error as any)?.detail).toBe('TRAINING_COMPLETION_LIMIT_EXCEEDED');await b.exec('ROLLBACK');
  await actor(db,owner);expect((await training(db)).current_trainings).toBe(1);
 });
});
