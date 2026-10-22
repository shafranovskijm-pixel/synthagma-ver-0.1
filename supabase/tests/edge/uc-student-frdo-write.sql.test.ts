// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createUcStudentFrdoWriteFixture} from '../../functions/_shared/uc-student-frdo-write.fixture';
const id=(n:number)=>'c0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),owner=id(3),student=id(4),student2=id(5),reader=id(6),teacher=id(7),writer=id(8),expired=id(9),viewer=id(10),sales=id(11),admin=id(12),company=id(13),outside=id(14),docs=id(15),revoked=id(16);
const course=id(20),group=id(21),group2=id(22),teacherStaff=id(23);
let db:PGlite;
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false);SELECT set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
async function denied(sql:string,args:any[]=[],code='42501'){await db.exec('SAVEPOINT rejected');try{await db.query(sql,args);throw new Error('Expected denial');}catch(e:any){expect(e.code).toBe(code);}finally{await db.exec('ROLLBACK TO rejected');}}
const rpc='SELECT (save_student_frdo_data($1,$2,$3)).*';
const insert='INSERT INTO student_frdo_data(organization_id,user_id,snils)VALUES($1,$2,$3) RETURNING *';
const can=async(u=student,o=org)=>(await row('SELECT can_write_student_frdo_data($1,$2) yes',[o,u])).yes;
beforeAll(async()=>{db=await createUcStudentFrdoWriteFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic A'),($2,'Synthetic B')",[org,other]);
 for(const u of [owner,student,student2,reader,teacher,writer,expired,viewer,sales,admin,company,docs,revoked])await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic Test Patronovich')",[u,org]);
 await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic Outside Patronovich')",[outside,other]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'student'),($5,'admin'),($6,'sales_manager'),($7,'admin'),($8,'company')",[owner,student,student2,outside,viewer,sales,admin,company]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 for(const [u,r,p] of [[reader,'custom',['frdo.read']],[writer,'custom',['frdo.write']],[docs,'custom',['documents.write','students.write']],[expired,'custom',['frdo.write']],[revoked,'custom',['frdo.write']]])await db.query('INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,$3,$4)',[u,org,r,JSON.stringify(p)]);
 await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id=$1",[expired]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"frdo.write\"]')",[teacherStaff,teacher,org]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Synthetic course')",[course,org]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Assigned'),($4,$2,$3,'Other')",[group,org,course,group2]);
 await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$5)',[org,group,student,group2,student2]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[revoked]);await as(owner);
});
afterEach(async()=>db?.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());
it('installs exact captured writers and permits owner, frdo writer and active learner self entry',async()=>{
 expect(await can()).toBe(true);await row(insert,[org,student,'synthetic-owner']);
 await as(writer);expect(await can()).toBe(true);expect((await row(rpc,[org,student,{snils:'synthetic-writer'}])).snils).toBe('synthetic-writer');
 await as(student);expect(await can()).toBe(true);await db.query("UPDATE student_frdo_data SET passport_number='synthetic-passport' WHERE user_id=$1",[student]);
 expect((await row('SELECT passport_number FROM student_frdo_data WHERE user_id=$1',[student])).passport_number).toBe('synthetic-passport');
});

it.each([reader,expired,viewer,sales,company,docs,revoked,student2,outside])('denies foreign FRDO to unauthorized caller %s through both RPC and DML',async(u)=>{
 await row(insert,[org,student,'original']);await as(u);expect(await can()).toBe(false);
 await denied(rpc,[org,student,{snils:'forged'}]);await denied(insert,[org,student,'forged']);
 expect((await db.query("UPDATE student_frdo_data SET snils='forged' WHERE user_id=$1 RETURNING *",[student])).rows).toHaveLength(0);
 await db.exec('RESET ROLE');expect((await row('SELECT snils FROM student_frdo_data WHERE user_id=$1',[student])).snils).toBe('original');
});
it('requires explicit FRDO delegation and assigned student scope for a teacher',async()=>{
 await as(teacher);expect(await can()).toBe(true);expect(await can(student2)).toBe(false);
 await row(rpc,[org,student,{snils:'delegated'}]);await denied(rpc,[org,student2,{snils:'forged'}]);
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"documents.write\",\"students.write\"]' WHERE user_id=$1",[teacher]);
 await as(teacher);expect(await can()).toBe(false);await denied(rpc,[org,student,{snils:'forged'}]);
});
it('allows an active learner to insert only own current-tenant row and never delete it',async()=>{
 await as(student);await row(insert,[org,student,'own']);await denied(insert,[other,student,'foreign']);await denied(insert,[org,student2,'foreign']);
 expect((await db.query('DELETE FROM student_frdo_data WHERE user_id=$1 RETURNING *',[student])).rows).toHaveLength(0);
 expect((await row('SELECT snils FROM student_frdo_data WHERE user_id=$1',[student])).snils).toBe('own');
});
it.each(['organization_id','user_id','id','created_at'])('makes existing row identity immutable even for authorized owner: %s',async(key)=>{
 await row(insert,[org,student,'original']);const value=key==='created_at'?'2000-01-01T00:00:00Z':id(899);
 await denied('UPDATE student_frdo_data SET '+key+'=$1 WHERE user_id=$2',[value,student]);
});
it('does not accept archived, revoked, foreign, unknown or non-student targets',async()=>{
 await db.exec('RESET ROLE');await db.query('UPDATE profiles SET archived_at=now() WHERE user_id=$1',[student]);await as(owner);
 for(const [o,u] of [[org,student],[org,revoked],[org,outside],[org,owner],[org,company],[org,id(999)],[other,student2]]){
  expect(await can(u,o)).toBe(false);await denied(rpc,[o,u,{snils:'forged'}]);await denied(insert,[o,u,'forged']);
 }
});
it('retains legacy SELECT history without authorizing edits or guessing tenant bindings',async()=>{
 await db.exec('RESET ROLE');await db.exec('ALTER TABLE student_frdo_data DISABLE TRIGGER uc_student_frdo_write_guard');
 await db.query('INSERT INTO student_frdo_data(organization_id,user_id,snils)VALUES($1,$2,$3)',[other,student,'legacy-binding']);
 await db.exec('ALTER TABLE student_frdo_data ENABLE TRIGGER uc_student_frdo_write_guard');
 await as(student);expect((await row('SELECT snils FROM student_frdo_data WHERE organization_id=$1 AND user_id=$2',[other,student])).snils).toBe('legacy-binding');
 expect(await can(student,other)).toBe(false);expect((await db.query("UPDATE student_frdo_data SET snils='forged' WHERE organization_id=$1 AND user_id=$2 RETURNING *",[other,student])).rows).toHaveLength(0);
 await as(admin);expect((await row('SELECT snils FROM student_frdo_data WHERE organization_id=$1',[other])).snils).toBe('legacy-binding');await denied(rpc,[other,student,{snils:'forged'}]);
});
it('preserves partial passport upserts and original full-form RPC replacement semantics',async()=>{
 await row(rpc,[org,student,{snils:'keep',education_level:'Higher',first_name:'Original'}]);
 await db.query("INSERT INTO student_frdo_data(organization_id,user_id,passport_number)VALUES($1,$2,'synthetic-passport') ON CONFLICT(user_id,organization_id)DO UPDATE SET passport_number=excluded.passport_number",[org,student]);
 expect(await row('SELECT snils,education_level,passport_number FROM student_frdo_data WHERE user_id=$1',[student])).toEqual({snils:'keep',education_level:'Higher',passport_number:'synthetic-passport'});
 const full=await row(rpc,[org,student,{last_name:'Replacement'}]);expect(full).toMatchObject({last_name:'Replacement',first_name:null,snils:null,education_level:null,passport_number:'synthetic-passport',citizenship_code:'643'});
});
it('self factual entry cannot manufacture verification or staff approval through FRDO fields or the service-only registration RPC',async()=>{
 await as(student);const saved=await row(rpc,[org,student,{last_name:'Self declaration',identity_verified:true,status:'verified',verified_by:student,verified_at:'2026-01-01',created_by:student}]);
 for(const key of ['identity_verified','status','verified_by','verified_at','created_by'])expect(key in saved).toBe(false);
 await denied('SELECT save_student_registration_details($1,$2,$3,NULL,NULL,NULL,true)',[org,student,student]);
 await as(null,'service_role');await denied('SELECT save_student_registration_details($1,$2,$3,NULL,NULL,NULL,true)',[org,student,student]);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM video_identifications')).n).toBe(0);
 // This proves FRDO/RPC isolation only; separate legacy video-identification RLS
 // was audited and reported as its own vulnerability, never called trusted here.
});
it.each(['anon','service_role'])('denies general full-form RPC and public helper to %s',async(role)=>{
 await as(null,role);await denied(rpc,[org,student,{snils:'forged'}]);await denied('SELECT can_write_student_frdo_data($1,$2)',[org,student]);
});
it('permits only exact profile-derived names/gender in the existing service registration stub',async()=>{
 await as(null,'service_role');const stub=await row("INSERT INTO student_frdo_data(organization_id,user_id,last_name,first_name,middle_name,gender)VALUES($1,$2,'Synthetic','Test','Patronovich',NULL) RETURNING *",[org,student]);
 expect(stub.last_name).toBe('Synthetic');await denied("UPDATE student_frdo_data SET snils='forged' WHERE user_id=$1",[student]);
 await denied("INSERT INTO student_frdo_data(organization_id,user_id,last_name)VALUES($1,$2,'Guessed')",[org,student2]);
 await denied("INSERT INTO student_frdo_data(organization_id,user_id,last_name,first_name,middle_name,gender,passport_number)VALUES($1,$2,'Synthetic','Test','Patronovich',NULL,'forged')",[org,student2]);
 await denied("INSERT INTO student_frdo_data(organization_id,user_id,last_name,first_name,middle_name,gender)VALUES($1,$2,'Synthetic','Test','Patronovich',NULL)",[other,student2]);
});
it('service stub preserves existing manual overrides while supporting blank or exact-derived retries',async()=>{
 await row(rpc,[org,student,{last_name:'Manual override',first_name:'Test',middle_name:'Patronovich'}]);await as(null,'service_role');
 const upsert="INSERT INTO student_frdo_data(organization_id,user_id,last_name,first_name,middle_name,gender)VALUES($1,$2,'Synthetic','Test','Patronovich',NULL) ON CONFLICT(user_id,organization_id)DO UPDATE SET last_name=excluded.last_name,first_name=excluded.first_name,middle_name=excluded.middle_name,gender=excluded.gender";
 await denied(upsert,[org,student]);await db.exec('RESET ROLE');expect((await row('SELECT last_name FROM student_frdo_data WHERE user_id=$1',[student])).last_name).toBe('Manual override');
 await as(owner);await row(rpc,[org,student,{birth_date:'1990-01-01'}]);await as(null,'service_role');await db.query(upsert,[org,student]);await db.query(upsert,[org,student]);
 expect((await row('SELECT last_name,birth_date::text FROM student_frdo_data WHERE user_id=$1',[student]))).toEqual({last_name:'Synthetic',birth_date:'1990-01-01'});
});
it.each(['sales_role','platform_viewer','platform_sales','platform_expired'])('mixed-role FRDO delegation cannot bypass platform read-only fence: %s',async(kind)=>{
 await as(null,'service_role');await db.exec('RESET ROLE');if(kind==='sales_role')await db.query("INSERT INTO user_roles VALUES($1,'sales_manager')",[writer]);
 else await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,$2,CASE WHEN $3='platform_expired' THEN now()-interval '1 day' ELSE NULL END)",[writer,kind==='platform_expired'?'admin':kind==='platform_sales'?'sales_manager':'viewer',kind]);
 await as(writer);expect(await can()).toBe(false);await denied(rpc,[org,student,{snils:'forged'}]);await denied(insert,[org,student,'forged']);
});
it.each(['viewer','sales_manager','expired_admin','expired_viewer'])('learner SELF cannot bypass global platform read-only legacy mixed role: %s',async(kind)=>{
 await as(student);expect(await can()).toBe(true);
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,$2,CASE WHEN $3 LIKE 'expired_%' THEN now()-interval '1 day' ELSE NULL END)",[student,kind==='expired_admin'?'admin':kind==='expired_viewer'?'viewer':kind,kind]);
 // Deliberately no global admin role: this exercises the legacy mixed-role gap.
 await as(student);expect(await can()).toBe(false);await denied(rpc,[org,student,{snils:'forged'}]);await denied(insert,[org,student,'forged']);
});
const details='SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,false) result';
it('preserves explicit-actor service registration merge with independent FRDO authority and empty contexts',async()=>{
 await row(rpc,[org,student,{first_name:'Keep',snils:'old'}]);await db.query("UPDATE student_frdo_data SET passport_number='keep-passport' WHERE user_id=$1",[student]);
 await as(null,'service_role');const r=await row(details,[org,student,owner,'Department','00000000000','1990-01-01']);expect(r.result.success).toBe(true);
 await db.exec('RESET ROLE');expect(await row('SELECT first_name,snils,birth_date::text,passport_number FROM student_frdo_data WHERE user_id=$1',[student])).toEqual({first_name:'Keep',snils:'000-000-000 00',birth_date:'1990-01-01',passport_number:'keep-passport'});
 expect((await row('SELECT count(*)::int n FROM uc_student_frdo_write_contexts')).n).toBe(0);expect((await row('SELECT count(*)::int n FROM video_identifications')).n).toBe(0);
});
it.each([reader,expired,viewer,sales,docs,revoked,student,writer])('rejects registration FRDO through explicit ineligible actor %s without leaving partial department edits',async(actor)=>{
 await as(null,'service_role');await denied(details,[org,student,actor,'Must rollback','00000000000','1990-01-01']);
 await db.exec('RESET ROLE');expect((await row('SELECT department FROM profiles WHERE user_id=$1',[student])).department).toBeNull();expect((await row('SELECT count(*)::int n FROM uc_student_frdo_write_contexts')).n).toBe(0);
});
it('explicit registration actor requires both existing students.write and FRDO.write; teacher assignment still applies',async()=>{
 await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.write\",\"frdo.write\"]' WHERE user_id=$1",[teacher]);await as(null,'service_role');
 await row(details,[org,student,teacher,null,null,'1990-01-01']);await denied(details,[org,student2,teacher,null,null,'1990-01-01']);
});
it('department-only registration preserves students.write without requiring FRDO permission',async()=>{
 await as(null,'service_role');expect((await row(details,[org,student,docs,'Department only',null,null])).result.success).toBe(true);
 await db.exec('RESET ROLE');expect((await row('SELECT department FROM profiles WHERE user_id=$1',[student])).department).toBe('Department only');expect((await row('SELECT count(*)::int n FROM student_frdo_data')).n).toBe(0);
});
it.each([reader,expired,viewer,sales,revoked,student,writer])('department-only registration rejects inactive or unauthorized actor %s',async(actor)=>{
 await as(null,'service_role');await denied(details,[org,student,actor,'Forbidden department',null,null]);await db.exec('RESET ROLE');expect((await row('SELECT department FROM profiles WHERE user_id=$1',[student])).department).toBeNull();
});
it('registration staff identity claim requires both students.write and documents.write, without making an FRDO approval',async()=>{
 await as(null,'service_role');const confirm='SELECT save_student_registration_details($1,$2,$3,NULL,NULL,NULL,true) result';
 expect((await row(confirm,[org,student,docs])).result.identity_confirmed).toBe(true);
 await db.exec('RESET ROLE');expect(await row('SELECT status,verified_by FROM video_identifications WHERE user_id=$1',[student])).toEqual({status:'verified',verified_by:docs});expect((await row('SELECT count(*)::int n FROM student_frdo_data')).n).toBe(0);
 await db.query("UPDATE org_staff SET sections_access='[\"students.write\"]' WHERE user_id=$1",[docs]);await as(null,'service_role');await denied(confirm,[org,student2,docs]);
});
it('department and identity claim preserve exact assigned teacher scope and reject mixed platform read-only delegation',async()=>{
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.write\",\"documents.write\"]' WHERE user_id=$1",[teacher]);await as(null,'service_role');
 await row(details,[org,student,teacher,'Assigned department',null,null]);await denied(details,[org,student2,teacher,'Foreign group',null,null]);
 await db.exec('RESET ROLE');await db.query("INSERT INTO user_roles VALUES($1,'sales_manager')",[docs]);await as(null,'service_role');await denied(details,[org,student,docs,'Sales override',null,null]);
});
const prepare='SELECT can_prepare_student_registration_details($1,$2,$3,$4) allowed';
it('prepares future registration through currentcaller authority before a new target exists',async()=>{
 await as(owner);expect((await row(prepare,[org,null,true,true])).allowed).toBe(true);
 await as(docs);expect((await row(prepare,[org,null,false,false])).allowed).toBe(true);expect((await row(prepare,[org,null,false,true])).allowed).toBe(true);expect((await row(prepare,[org,null,true,false])).allowed).toBe(false);
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.write\"]' WHERE user_id=$1",[docs]);await as(docs);expect((await row(prepare,[org,null,false,true])).allowed).toBe(false);
});
it.each([reader,writer,expired,viewer,sales,revoked,student,company,outside])('future-registration preflight refuses unauthorized caller %s',async(u)=>{
 await as(u);expect((await row(prepare,[org,null,false,false])).allowed).toBe(false);
});
it('future-registration preflight checks exact assigned group and optional permissions independently',async()=>{
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.write\",\"frdo.write\",\"documents.write\"]' WHERE user_id=$1",[teacher]);await as(teacher);
 expect((await row(prepare,[org,group,true,true])).allowed).toBe(true);for(const g of [null,group2,id(999)])expect((await row(prepare,[org,g,false,false])).allowed).toBe(false);
 expect((await row(prepare,[other,group,true,true])).allowed).toBe(false);expect((await row(prepare,[org,group,null,false])).allowed).toBe(false);
 await db.exec('RESET ROLE');await db.query('UPDATE org_staff SET expires_at=now()-interval\'1 day\' WHERE user_id=$1',[teacher]);await as(teacher);expect((await row(prepare,[org,group,true,true])).allowed).toBe(false);
});
it.each(['anon','service_role'])('future-registration preflight has no callable service/token bypass for %s',async(role)=>{await as(null,role);await denied(prepare,[org,group,false,false]);});
it('private contexts and helper internals cannot be invoked or populated by authenticated or service callers',async()=>{
 for(const role of ['authenticated','service_role']){await as(role==='authenticated'?owner:null,role);await denied('SELECT * FROM uc_student_frdo_write_contexts');await denied("INSERT INTO uc_student_frdo_write_contexts(kind,organization_id,user_id,actor_id)VALUES('registration_details',$1,$2,$3)",[org,student,owner]);await denied('SELECT uc_student_frdo_actor_can_write($1,$2,$3,true)',[owner,org,student]);}
});
it.each(['transaction','backend','field'])('does not accept a stale, foreign-backend or wider-field service context: %s',async(kind)=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO uc_student_frdo_write_contexts(kind,organization_id,user_id,actor_id,transaction_id,backend_pid)VALUES('registration_details',$1,$2,$3,CASE WHEN $4='transaction' THEN txid_current()-1 ELSE txid_current() END,CASE WHEN $4='backend' THEN pg_backend_pid()+1 ELSE pg_backend_pid() END)",[org,student,owner,kind]);
 await as(null,'service_role');await denied(kind==='field'?"INSERT INTO student_frdo_data(organization_id,user_id,snils,passport_number)VALUES($1,$2,'000-000-000 00','forged')":"INSERT INTO student_frdo_data(organization_id,user_id,snils)VALUES($1,$2,'000-000-000 00')",[org,student]);
});
it('rolls back a transient context and all department/FRDO edits if the guarded write fails after context creation',async()=>{
 await db.exec('RESET ROLE');await db.exec("CREATE FUNCTION fixture_frdo_failure()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic rejected FRDO write';END$$;CREATE TRIGGER fixture_frdo_failure AFTER INSERT ON student_frdo_data FOR EACH ROW EXECUTE FUNCTION fixture_frdo_failure();");
 await as(null,'service_role');await denied(details,[org,student,owner,'Must rollback',null,'1990-01-01'],'P0001');
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM uc_student_frdo_write_contexts')).n).toBe(0);expect((await row('SELECT count(*)::int n FROM student_frdo_data')).n).toBe(0);expect((await row('SELECT department FROM profiles WHERE user_id=$1',[student])).department).toBeNull();
});
it('service profile sync affects only derived current-tenant names, preserves manual overrides and leaves no context',async()=>{
 await row(rpc,[org,student,{last_name:'Synthetic',first_name:'Manual',middle_name:'Patronovich',snils:'keep'}]);
 await as(null,'service_role');await db.query("UPDATE profiles SET full_name='Updated New Patronovna' WHERE user_id=$1",[student]);
 await db.exec('RESET ROLE');expect(await row('SELECT last_name,first_name,middle_name,snils FROM student_frdo_data WHERE user_id=$1',[student])).toEqual({last_name:'Updated',first_name:'Manual',middle_name:'Patronovna',snils:'keep'});expect((await row('SELECT count(*)::int n FROM uc_student_frdo_write_contexts')).n).toBe(0);
});
it('profile name edits without FRDO authority do not silently modify FRDO',async()=>{
 await row(rpc,[org,student,{last_name:'Synthetic',first_name:'Test',middle_name:'Patronovich'}]);
 // Isolate the name-sync trigger from unrelated legacy profile RLS in this fixture.
 // Keep the real caller JWT so the trigger must make its own FRDO decision.
 await as(docs);await db.exec('RESET ROLE');await db.query("UPDATE profiles SET full_name='Changed Name Patronovna' WHERE user_id=$1",[student]);
 await db.exec('RESET ROLE');expect((await row('SELECT full_name FROM profiles WHERE user_id=$1',[student])).full_name).toBe('Changed Name Patronovna');expect((await row('SELECT last_name FROM student_frdo_data WHERE user_id=$1',[student])).last_name).toBe('Synthetic');
});
it('never converts a fake erase setting into authenticated deletion or general service deletion',async()=>{
 await row(insert,[org,student,'keep']);await as(student);await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[student]);
 expect((await db.query('DELETE FROM student_frdo_data WHERE user_id=$1 RETURNING *',[student])).rows).toHaveLength(0);
 await as(null,'service_role');await denied('DELETE FROM student_frdo_data WHERE user_id=$1',[student]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);await as(null,'service_role');
 expect((await db.query('DELETE FROM student_frdo_data WHERE user_id=$1 RETURNING *',[student])).rows).toHaveLength(1);
});

let request=1000;
async function bindProgramme(){
 const doc=id(100),requestId=id(++request),path=org+'/versions/'+doc+'/'+requestId+'.pdf';
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"test-exact-file\",\"mimetype\":\"application/pdf\"}')",[path]);
 await as(owner);await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Synthetic programme','program_approval','active')",[doc,org]);
 const version=(await row('SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5) d',[doc,org,requestId,{file_path:path,file_name:'Synthetic.pdf',file_size:42},{status:'active'}])).d.version_id;
 let review=(await row('SELECT save_org_document_review_draft($1,$2,1,0,$3,$4,$5,$6) d',[doc,version,owner,docs,[],id(++request)])).d;
 review=(await row("SELECT transition_org_document_review($1,$2,1,'submit',NULL,NULL,NULL,$3) d",[review.id,review.revision,id(++request)])).d;
 await as(docs);await row("SELECT transition_org_document_review($1,$2,1,'approve',NULL,'SYNTHETIC/1','2026-10-18',$3) d",[review.id,review.revision,id(++request)]);
 await as(owner);const facts={schema_version:1,full_title:'Frozen approved programme',program_type:'dpo_upskilling',academic_hours:72,training_form:'part_time',uses_elearning:true,uses_distance_learning:true,duration_calendar:'Two weeks',attestation_form:'Test',attestation_criteria:'Synthetic threshold',qualification:null,profession:null};
 let v=(await row('SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,0,$7) d',[org,id(101),'Synthetic programme',version,docs,facts,id(++request)])).d;
 v=(await row("SELECT transition_program_facts_version($1,$2,'submit',NULL,$3) d",[v.id,v.revision,id(++request)])).d;
 await as(docs);v=(await row("SELECT transition_program_facts_version($1,$2,'approve',NULL,$3) d",[v.id,v.revision,id(++request)])).d;
 await as(owner);await row('SELECT bind_course_program_version($1,$2,$3,0,$4)',[org,course,v.id,id(++request)]);await row('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)',[org,group,course,v.id,id(++request)]);
 await db.exec('RESET ROLE');const e=(await row("INSERT INTO enrollments(user_id,course_id,status)VALUES($1,$2,'active') ON CONFLICT(user_id,course_id)DO UPDATE SET status=excluded.status RETURNING id",[student,course])).id;
 await as(owner);await row('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4)',[org,group,[e],id(++request)]);await row(rpc,[org,student,{birth_date:'1990-01-01'}]);
 return e;
}
async function observeIssuanceLock(){
 await db.exec('RESET ROLE');
 const source=(await row("SELECT pg_get_functiondef('uc_program_issuance_source(uuid,uuid,uuid,uuid,uuid)'::regprocedure) source")).source;
 await db.exec(source.replace('public.uc_program_issuance_source(','public.uc_program_issuance_source_test_delegate('));
 await db.exec(`CREATE TEMP TABLE issuance_lock_observations(held boolean NOT NULL);
 CREATE OR REPLACE FUNCTION public.uc_program_issuance_source(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)RETURNS public.group_program_enrollment_snapshots LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$DECLARE k bigint:=hashtextextended(p_org::text,0);BEGIN
 INSERT INTO issuance_lock_observations SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND classid::bigint=((k>>32)&4294967295) AND objid::bigint=(k&4294967295) AND objsubid=1 AND mode='ExclusiveLock' AND granted);
 RETURN public.uc_program_issuance_source_test_delegate(p_org,p_group,p_enrollment,p_user,p_course);END$$;`);
}
it.each([false,true])('observes actual organization lock before source on automatic issuance after112=%s; no concurrency claim',async(fixed)=>{
 const e=await bindProgramme();await observeIssuanceLock();
 if(!fixed){const baseline=JSON.parse(readFileSync('supabase/tests/fixtures/uc-student-frdo-write-baseline.json','utf8'));await db.exec(baseline.issuanceFunctions.find((f:any)=>f.signature==='auto_create_education_document()').definition);}
 await as(owner);await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 const observations=(await db.query<any>('SELECT held FROM issuance_lock_observations')).rows.map(r=>r.held);expect(observations.length).toBeGreaterThanOrEqual(2);expect(observations[0]).toBe(fixed);expect(observations.slice(1).every(Boolean)).toBe(true);
 expect(await row('SELECT specialty_name FROM education_document_records WHERE enrollment_id=$1',[e])).toEqual({specialty_name:'Frozen approved programme'});
 expect((await row('SELECT count(*)::int n FROM education_document_program_sources')).n).toBe(1);expect((await row('SELECT sum(last_number)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).n).toBe(2);
});
it('manual issuer observes organization lock at every actual programme source call and preserves replay/counters',async()=>{
 const e=await bindProgramme();await observeIssuanceLock();await as(owner);
 const args=[org,group,course,[{user_id:student,enrollment_id:e,document_type:'certificate',issue_date:'2026-10-18',full_name:'Synthetic learner',birth_date:'1990-01-01',specialty_name:'Caller title'}]];
 const issued=(await db.query<any>('SELECT * FROM issue_education_document_batch($1,$2,$3,$4)',args)).rows;expect(issued[0].specialty_name).toBe('Frozen approved programme');
 expect((await db.query<any>('SELECT * FROM issue_education_document_batch($1,$2,$3,$4)',args)).rows).toEqual(issued);
 await db.exec('RESET ROLE');const observations=(await db.query<any>('SELECT held FROM issuance_lock_observations')).rows;expect(observations.length).toBeGreaterThanOrEqual(2);expect(observations.every(r=>r.held)).toBe(true);expect((await row('SELECT sum(last_number)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).n).toBe(2);
});
