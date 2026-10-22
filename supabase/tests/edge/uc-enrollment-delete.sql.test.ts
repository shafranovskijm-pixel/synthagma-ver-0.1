// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcEnrollmentDeleteFixture} from '../../functions/_shared/uc-enrollment-delete.fixture';
const id=(n:number)=>'d0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),owner=id(3),student=id(4),student2=id(5),reader=id(6),teacher=id(7),writer=id(8),expired=id(9),viewer=id(10),admin=id(11),sales=id(12),revoked=id(13),outside=id(14),company=id(15),course=id(20),course2=id(21),group=id(22),group2=id(23),teacherStaff=id(24),enrollment=id(30),enrollment2=id(31);
let db:PGlite;
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false);SELECT set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
async function denied(sql:string,args:any[]=[],code='42501'){await db.exec('SAVEPOINT rejected');try{await db.query(sql,args);throw new Error('Expected denial');}catch(e:any){expect(e.code).toBe(code);}finally{await db.exec('ROLLBACK TO rejected');}}
beforeAll(async()=>{db=await createUcEnrollmentDeleteFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic A'),($2,'Synthetic B')",[org,other]);
 for(const u of [owner,student,student2,reader,teacher,writer,expired,viewer,admin,sales,revoked,company])await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic learner')",[u,org]);
 await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic other')",[outside,other]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'admin'),($5,'admin'),($6,'sales_manager')",[owner,student,student2,viewer,admin,sales]);
 await db.query("INSERT INTO user_roles VALUES($1,'company')",[company]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 for(const [u,p] of [[reader,['students.read']],[writer,['students.write','courses.write']],[expired,['students.write']],[revoked,['students.write']]])await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom',$3)",[u,org,p]);
 await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id=$1",[expired]);await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[revoked]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"students.write\",\"courses.write\"]')",[teacherStaff,teacher,org]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Course A'),($3,$2,'Course B')",[course,org,course2]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Group A'),($4,$2,$5,'Group B')",[group,org,course,group2,course2]);
 await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$3),($1,$4,$5)',[org,group,student,group2,student2]);
 await db.query("INSERT INTO enrollments(id,user_id,course_id,status,progress,time_spent)VALUES($1,$2,$3,'active',0,0),($4,$5,$6,'active',0,0)",[enrollment,student,course,enrollment2,student2,course2]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
});
afterEach(async()=>db?.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());
it('allows exact students.write staff deletion without inventing self rights',async()=>{
 await as(writer);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(true);
 expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(1);
});
it('preserves the actual cancel_course_assignment contract and verifies exact deletion result',async()=>{
 await as(owner);expect((await row('SELECT cancel_course_assignment($1,$2) result',[enrollment,org])).result).toMatchObject({cancelled:true,enrollmentId:enrollment,organizationId:org,userId:student,courseId:course});
});
it.each([student,reader,viewer,expired,revoked,teacher])('actual definer cancellation cannot bypass canonical scope for %s',async(u)=>{
 await as(u);await denied('SELECT cancel_course_assignment($1,$2)',[u===teacher?enrollment2:enrollment,org]);
});
it('actual cancellation still retains learning and incoming identity FK history',async()=>{
 await db.exec('RESET ROLE');await db.query('UPDATE enrollments SET progress=10 WHERE id=$1',[enrollment]);await as(owner);await denied('SELECT cancel_course_assignment($1,$2)',[enrollment,org],'23514');
 await db.exec('RESET ROLE');await db.query('UPDATE enrollments SET progress=0 WHERE id=$1',[enrollment]);await db.query("INSERT INTO video_identifications(user_id,organization_id,enrollment_id,status)VALUES($1,$2,$3,'pending')",[student,org,enrollment]);await as(owner);await denied('SELECT cancel_course_assignment($1,$2)',[enrollment,org],'23514');
});
it('actual cancellation preserves its READ COMMITTED contract',async()=>{
 await db.exec('ROLLBACK;BEGIN ISOLATION LEVEL REPEATABLE READ');await as(owner);
 // The ordinary setup rolled back, but the authority check needs a retained
 // actor: use the original base fixture owner/organization for this error path.
 await as('00000000-0000-4000-8000-000000000001');await denied('SELECT cancel_course_assignment($1,$2)',[enrollment,'00000000-0000-4000-8000-000000000100'],'25000');
});
it('preserves actual admin_delete_organization workflow with its original authenticated actor',async()=>{
 await as(admin);await db.query('SELECT admin_delete_organization($1)',[org]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM organizations WHERE id=$1',[org])).n).toBe(0);expect((await row('SELECT count(*)::int n FROM enrollments WHERE id IN($1,$2)',[enrollment,enrollment2])).n).toBe(0);expect((await row('SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
});
it('a platform viewer cannot use the original admin organization RPC to remove enrollments',async()=>{
 await as(viewer);await denied('SELECT admin_delete_organization($1)',[org]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id IN($1,$2)',[enrollment,enrollment2])).n).toBe(2);
});
it.each(['viewer','expired','sales','revoked'])('denies even empty organization RPC deletion before any mutation for global %s actor',async(kind)=>{
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO organizations(id,name)VALUES($1,'Empty synthetic organization')",[id(94)]);
 if(kind!=='viewer'){
  await db.query("INSERT INTO user_roles VALUES($1,'admin')",[writer]);
  if(kind==='expired')await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,'admin',now()-interval '1 day')",[writer]);
  else if(kind==='sales')await db.query("INSERT INTO user_roles VALUES($1,'sales_manager')",[writer]);
  else await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[writer]);
 }
 await as(kind==='viewer'?viewer:writer);await denied('SELECT admin_delete_organization($1)',[id(94)]);
 await db.exec('RESET ROLE');expect((await row('SELECT name FROM organizations WHERE id=$1',[id(94)])).name).toBe('Empty synthetic organization');
});
it('allows active admin empty organization deletion and preserves exact original body except the entry fence',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO organizations(id,name)VALUES($1,'Empty synthetic organization')",[id(94)]);
 const definition=(await row("SELECT pg_get_functiondef('admin_delete_organization(uuid)'::regprocedure) body")).body;
 const old=JSON.parse((await import('node:fs')).readFileSync('supabase/tests/fixtures/uc-enrollment-delete-baseline.json','utf8')).functions.find((f:any)=>f.signature==='admin_delete_organization(uuid)').definition;
 const addition="  IF NOT public.uc_enrollment_delete_actor_writable() THEN\n    RAISE EXCEPTION 'organization_delete_access_denied' USING ERRCODE='42501';\n  END IF;\n";
 expect(definition.replace(addition,'')).toBe(old);
 await as(admin);await db.query('SELECT admin_delete_organization($1)',[id(94)]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM organizations WHERE id=$1',[id(94)])).n).toBe(0);
});
it.each(['organization','course'])('parent global fence applies with zero enrollment children: %s',async(kind)=>{
 await db.exec('RESET ROLE');const parent=kind==='organization'?other:course2;
 await as(owner);if(kind==='course')await db.query('DELETE FROM enrollments WHERE id=$1',[enrollment2]);
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO user_roles VALUES($1,'admin')",[writer]);await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,'admin',now()-interval '1 day')",[writer]);
 await as(writer);await denied('DELETE FROM '+(kind==='organization'?'organizations':'courses')+' WHERE id=$1',[parent]);
});
it.each([student,student2,reader,expired,viewer,sales,revoked,outside,company])('denies direct DELETE for caller %s including own learner row',async(u)=>{
 await as(u);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(false);
 expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(0);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).n).toBe(1);
});
it('teacher scope is exact enrollment course and assigned target membership, never any group of that user',async()=>{
 await as(teacher);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(true);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment2])).allowed).toBe(false);
 await db.exec('RESET ROLE');await db.query('UPDATE enrollments SET user_id=$1 WHERE id=$2',[student,enrollment2]);await as(teacher);
 expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment2])).allowed).toBe(false);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment2])).rows).toHaveLength(0);
 expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(1);
});
it('default teacher without students.write has no DELETE capability',async()=>{
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[]' WHERE user_id=$1",[teacher]);await as(teacher);
 expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(false);
});
it('revoked target cannot be deleted by ordinary authenticated staff',async()=>{
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);await as(owner);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(false);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(0);
});
it('supports authorized course FK cascade through a prospective tuple witness and cleans it',async()=>{
 await as(writer);expect((await db.query('DELETE FROM courses WHERE id=$1 RETURNING id',[course])).rows).toHaveLength(1);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE course_id=$1',[course])).n).toBe(0);expect((await row('SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
});
it('supports organization FK cascade even when profiles lose their org and nested courses disappear',async()=>{
 await as(admin);expect((await db.query('DELETE FROM organizations WHERE id=$1 RETURNING id',[org])).rows).toHaveLength(1);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id IN($1,$2)',[enrollment,enrollment2])).n).toBe(0);expect((await row('SELECT organization_id FROM profiles WHERE user_id=$1',[student])).organization_id).toBeNull();expect((await row('SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
});
it.each([viewer,reader,student])('parent cascade cannot bypass read-only or learner actor %s',async(u)=>{
 await as(u);for(const table of ['courses','organizations']){await db.exec('SAVEPOINT parent_denied');try{
  const result=await db.query('DELETE FROM '+table+' WHERE id=$1 RETURNING id',[table==='courses'?course:org]);expect(result.rows).toHaveLength(0);
 }catch(e:any){expect(e.code).toBe('42501');}finally{await db.exec('ROLLBACK TO parent_denied');}}
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).n).toBe(1);
});
it('teacher course cascade fails atomically if even one child is outside the assigned group',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO enrollments(id,user_id,course_id,status,progress)VALUES($1,$2,$3,'active',0)",[id(90),student2,course]);await as(teacher);
 await denied('DELETE FROM courses WHERE id=$1',[course]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE course_id=$1',[course])).n).toBe(2);expect((await row('SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
});
it('retains real CSZ protected enrollment DELETE denial without altering its body',async()=>{
 await db.exec('RESET ROLE');const protectedCourse='7630559a-6caf-42e7-97f9-1cd0e4598c39';await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Protected')",[protectedCourse,org]);
 await db.exec('ALTER TABLE enrollments DISABLE TRIGGER zzzz_csz_enrollment_guard');await db.query("INSERT INTO enrollments(id,user_id,course_id,status)VALUES($1,$2,$3,'active')",[id(91),student,protectedCourse]);await db.exec('ALTER TABLE enrollments ENABLE TRIGGER zzzz_csz_enrollment_guard');await as(owner);await denied('DELETE FROM enrollments WHERE id=$1',[id(91)]);
});
it('retains only the explicit service revoked-subject erasure context',async()=>{
 await as(null,'service_role');await denied('DELETE FROM enrollments WHERE id=$1',[enrollment]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);await as(null,'service_role');await denied('DELETE FROM enrollments WHERE id=$1',[enrollment]);await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[student]);
 expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(1);
});
it('authenticated user cannot convert an erase GUC into deletion permission',async()=>{
 await as(student);await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[student]);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(0);
});
it('private witnesses and internal predicates have no authenticated/service caller API',async()=>{
 for(const role of ['authenticated','service_role']){await as(role==='authenticated'?owner:null,role);await denied('SELECT * FROM uc_enrollment_delete_witnesses');await denied('SELECT uc_enrollment_delete_has_witness($1,$2,$3)',[enrollment,student,course]);await denied("INSERT INTO uc_enrollment_delete_witnesses(kind,parent_id,organization_id,enrollment_id,user_id,course_id,actor_id)VALUES('course',$1,$2,$3,$4,$1,$5)",[course,org,enrollment,student,owner]);}
});
it('empty parent deletion remains available to trusted service cleanup; foreign children never inherit owner erasure authority',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO organizations(id,name)VALUES($1,'Empty synthetic')",[id(92)]);await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Empty welcome')",[id(93),id(92)]);await as(null,'service_role');await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[owner]);
 expect((await db.query('DELETE FROM organizations WHERE id=$1 RETURNING id',[id(92)])).rows).toHaveLength(1);await denied('DELETE FROM organizations WHERE id=$1',[org]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).n).toBe(1);
});
it('prevents an unauthorized learner DELETE from cascading into captured identity history',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO video_identifications(user_id,organization_id,enrollment_id,status)VALUES($1,$2,$3,'pending')",[student,org,enrollment]);await as(student);await db.query('DELETE FROM enrollments');
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM video_identifications WHERE enrollment_id=$1',[enrollment])).n).toBe(1);
});
it('reproduces the old same-org learner deletion and identity cascade on actual unpatched RLS in an isolated fixture',async()=>{
 const old=await createUcEnrollmentDeleteFixture(false);try{
  await old.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
  await old.query('INSERT INTO organizations(id,name)VALUES($1,$2)',[org,'Synthetic isolated']);await old.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Attacker'),($3,$2,'Victim')",[student,org,student2]);await old.query("INSERT INTO user_roles VALUES($1,'student'),($2,'student')",[student,student2]);await old.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Unprotected course')",[course,org]);await old.query("INSERT INTO enrollments(id,user_id,course_id,status)VALUES($1,$2,$3,'active')",[enrollment,student2,course]);await old.query("INSERT INTO video_identifications(user_id,organization_id,enrollment_id,status)VALUES($1,$2,$3,'pending')",[student2,org,enrollment]);
  await old.exec("SELECT set_config('request.jwt.claim.sub','"+student+"',false),set_config('request.jwt.claim.role','authenticated',false);SET ROLE authenticated;DELETE FROM enrollments;RESET ROLE;");
  expect((await old.query<any>('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).rows[0].n).toBe(0);expect((await old.query<any>('SELECT count(*)::int n FROM video_identifications')).rows[0].n).toBe(0);
 }finally{await old.close();}
},30000);
it.each(['actor','transaction','backend','tuple'])('does not treat a forged/stale witness as authorization: %s',async(kind)=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO uc_enrollment_delete_witnesses(kind,parent_id,organization_id,enrollment_id,user_id,course_id,actor_id,transaction_id,backend_pid)VALUES('course',$1,$2,$3,$4,$5,$6,CASE WHEN $7='transaction' THEN txid_current()-1 ELSE txid_current() END,CASE WHEN $7='backend' THEN pg_backend_pid()+1 ELSE pg_backend_pid() END)",[course,org,enrollment,student,kind==='tuple'?course2:course,kind==='actor'?owner:reader,kind]);
 await as(reader);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(false);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(0);
});
it.each(['sales','viewer','platform_expired','actor_revoked','target_revoked'])('a captured witness cannot bypass a current global/subject fence: %s',async(kind)=>{
 await as(writer);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(true);
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO uc_enrollment_delete_witnesses(kind,parent_id,organization_id,enrollment_id,user_id,course_id,actor_id)VALUES('course',$1,$2,$3,$4,$1,$5)",[course,org,enrollment,student,writer]);
 if(kind==='sales')await db.query("INSERT INTO user_roles VALUES($1,'sales_manager')",[writer]);
 else if(kind==='viewer'||kind==='platform_expired')await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,$2,CASE WHEN $3='platform_expired' THEN now()-interval '1 day' ELSE NULL END)",[writer,kind==='viewer'?'viewer':'admin',kind]);
 else await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[kind==='actor_revoked'?writer:student]);
 await as(writer);expect((await row('SELECT can_delete_course_enrollment($1) allowed',[enrollment])).allowed).toBe(false);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(0);
});
it('observes the real cascade using its captured witness after live parent/course/profile joins are unavailable',async()=>{
 await db.exec('RESET ROLE');await db.exec(`CREATE TEMP TABLE cascade_observation(live_allowed boolean,witness_allowed boolean,course_visible boolean,profile_org_visible boolean,actor uuid);
 CREATE FUNCTION fixture_observe_cascade()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN INSERT INTO cascade_observation SELECT uc_enrollment_delete_live_allowed(OLD.id,OLD.user_id,OLD.course_id),uc_enrollment_delete_has_witness(OLD.id,OLD.user_id,OLD.course_id),EXISTS(SELECT 1 FROM courses WHERE id=OLD.course_id),EXISTS(SELECT 1 FROM profiles WHERE user_id=OLD.user_id AND organization_id='${org}'),auth.uid();RETURN OLD;END$$;
 CREATE TRIGGER t_observe_cascade BEFORE DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION fixture_observe_cascade();`);
 await as(admin);await db.query('DELETE FROM organizations WHERE id=$1',[org]);await db.exec('RESET ROLE');const observations=(await db.query<any>('SELECT * FROM cascade_observation')).rows;
 expect(observations).toHaveLength(2);expect(observations.every(r=>r.live_allowed===false&&r.witness_allowed===true&&r.course_visible===false&&r.profile_org_visible===false&&r.actor===admin)).toBe(true);expect((await row('SELECT count(*)::int n FROM uc_enrollment_delete_witnesses')).n).toBe(0);
});
