// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcProgramFactsFixture} from '../../functions/_shared/uc-program-facts.fixture';
import {parseProgramEnvelope,parseProgramList,programCandidatesSchema,parseCourseBinding,parseGroupProgramFacts} from '../../../src/lib/programFacts';
import {parseGroupProgramGeneration,programGenerationScalars,programDate,programGroupLabel,programTrainingPeriod} from '../../functions/_shared/program-facts';
const id=(n:number)=>'b0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),owner=id(3),reviewer=id(4),reader=id(5),teacher=id(6),student=id(7),student2=id(8),viewer=id(9),admin=id(10),writer=id(11);
const doc=id(20),course=id(21),group=id(22),group2=id(23),foreignGroup=id(24),program=id(25),teacherStaff=id(26);
const facts={schema_version:1,full_title:'Reviewed programme',program_type:'dpo_upskilling',academic_hours:72,training_form:'part_time',uses_elearning:true,uses_distance_learning:true,duration_calendar:'Two weeks',attestation_form:'Final test',attestation_criteria:'Reviewed criteria v1',qualification:null,profession:null};
let db:PGlite,fileVersion:string,request=1000;
const req=()=>id(++request);
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false);SELECT set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const createSql='SELECT create_program_facts_version($1,$2,$3,$4,$5,$6,$7,$8,$9) d';
const args=(o:any={})=>[o.org??org,o.program??program,o.name??'Programme',null,o.file??fileVersion,o.reviewer??reviewer,JSON.stringify(o.facts??facts),o.rev??0,o.request??req()];
const create=async(o:any={})=>(await row(createSql,args(o))).d;
const transitionSql='SELECT transition_program_facts_version($1,$2,$3,$4,$5) d';
const transition=async(v:any,action:string,o:any={})=>(await row(transitionSql,[v.id,o.rev??v.revision,action,o.note??null,o.request??req()])).d;
const courseBindSql='SELECT bind_course_program_version($1,$2,$3,$4,$5) d';
const bindCourse=async(v:any,rev=0)=>(await row(courseBindSql,[org,course,v.id,rev,req()])).d;
const groupBindSql='SELECT bind_group_program_version($1,$2,$3,$4,$5,$6) d';
const bindGroup=async(v:any,g=group,rev=0)=>(await row(groupBindSql,[org,g,course,v.id,rev,req()])).d;
const get=async(g=group,e:string|null=null)=>(await row('SELECT get_group_program_facts($1,$2,$3) d',[org,g,e])).d;
async function denied(sql:string,a:any[]=[],code='42501'){
 await db.exec('SAVEPOINT rejected');try{await db.query(sql,a);throw new Error('Expected denial');}catch(e:any){expect(e.code).toBe(code);}finally{await db.exec('ROLLBACK TO rejected');}
}
async function approveFile(){
 const uploadRequest=req();const path=org+'/versions/'+doc+'/'+uploadRequest+'.pdf';await db.exec('RESET ROLE');
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"programme-file\",\"mimetype\":\"application/pdf\"}')",[path]);
 await as(owner);const result=(await row('SELECT commit_org_document_version($1,$2,$3,$4,$5,NULL,$6) d',[doc,org,uploadRequest,(await row('SELECT document_revision FROM org_documents WHERE id=$1',[doc])).document_revision,JSON.stringify({file_path:path,file_name:'Programme.pdf',file_size:42,change_summary:'Actual file'}),JSON.stringify({status:'active'})])).d;
 const dr=result.revision??result.document_revision??(await row('SELECT document_revision FROM org_documents WHERE id=$1',[doc])).document_revision;
 let review=(await row('SELECT save_org_document_review_draft($1,$2,$3,0,$4,$5,$6,$7) d',[doc,result.version_id,dr,owner,reviewer,'[]',req()])).d;
 review=(await row("SELECT transition_org_document_review($1,$2,$3,'submit',NULL,NULL,NULL,$4) d",[review.id,review.revision,dr,req()])).d;
 await as(reviewer);await row("SELECT transition_org_document_review($1,$2,$3,'approve',NULL,'INTERNAL/1','2026-10-18',$4) d",[review.id,review.revision,dr,req()]);
 await as(owner);return result.version_id;
}
async function approved(o:any={}){const v=await create(o);const submitted=await transition(v,'submit');await as(reviewer);const result=await transition(submitted,'approve');await as(owner);return result;}
async function bound(){const v=await approved();await bindCourse(v);await bindGroup(v);return v;}
async function membership(u=student,g=group){await db.exec('RESET ROLE');await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)',[org,g,u]);await as(owner);}
async function enroll(u=student,c=course){await db.exec('RESET ROLE');const e=await row("INSERT INTO enrollments(user_id,course_id,status,progress,time_spent)VALUES($1,$2,'active',0,0) RETURNING id",[u,c]);await as(owner);return e.id;}
beforeAll(async()=>{db=await createUcProgramFactsFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic A'),($2,'Synthetic B')",[org,other]);
 for(const [u,t,n] of [[owner,org,'Owner'],[reviewer,org,'Reviewer'],[reader,org,'Reader'],[teacher,org,'Teacher'],[student,org,'Student 1'],[student2,org,'Student 2'],[writer,other,'Multi-org writer']])await db.query('INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)',[u,t,n]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'admin'),($5,'admin')",[owner,student,student2,viewer,admin]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'custom','[\"documents.read\",\"documents.write\"]'),($4,$5,$3,'custom','[\"documents.read\"]'),($6,$7,$3,'teacher','[\"documents.read\",\"documents.write\"]'),($8,$9,$3,'custom','[\"documents.read\",\"documents.write\"]')",[id(30),reviewer,org,id(31),reader,teacherStaff,teacher,id(32),writer]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Mutable course')",[course,org]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name,start_date,end_date)VALUES($1,$2,$3,'Group 1','2026-11-01','2026-11-14'),($4,$2,$3,'Group 2','2026-12-01','2026-12-14'),($5,$6,NULL,'Foreign',NULL,NULL)",[group,org,course,group2,foreignGroup,other]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
 await db.query("INSERT INTO org_documents(id,organization_id,name,type,status,file_url)VALUES($1,$2,'Programme file','program_approval','active',NULL)",[doc,org]);
 fileVersion=await approveFile();
});
afterEach(async()=>db?.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());

it('separately reviews exact programme facts after genuine file approval',async()=>{
 const c=(await row('SELECT list_program_facts_candidates($1) d',[org])).d;expect(c.files.map((f:any)=>f.version_id)).toEqual([fileVersion]);
 expect(programCandidatesSchema.parse(c)).toEqual(c);
 const v=await create();expect(v).toMatchObject({state:'draft',file_version_id:fileVersion,facts,revision:1});expect(v.facts_hash).toMatch(/^[a-f0-9]{64}$/);
 await denied(courseBindSql,[org,course,v.id,0,req()],'22023');
 const s=await transition(v,'submit');await denied(transitionSql,[s.id,s.revision,'approve',null,req()]);
 await as(reviewer);const a=await transition(s,'approve');expect(a).toMatchObject({state:'approved',approved_by:reviewer,revision:3});
 await as(owner);expect((await bindCourse(a)).version_id).toBe(a.id);
 const envelope=(await row('SELECT get_program_facts($1,$2) d',[org,program])).d;expect(parseProgramEnvelope(envelope,org,program)).toEqual(envelope);
 const list=(await row('SELECT list_program_facts($1) d',[org])).d;expect(parseProgramList(list,org)).toEqual(list);
 const courseEnvelope=(await row('SELECT get_course_program_binding($1,$2) d',[org,course])).d;expect(parseCourseBinding(courseEnvelope,org,course)).toEqual(courseEnvelope);
});
it('does not infer unknown hours or training facts from course fields',async()=>{
 const v=await create({facts:{...facts,academic_hours:null}});await denied(transitionSql,[v.id,v.revision,'submit',null,req()],'22023');
 expect((await get()).state).toBe('unconfirmed');expect((await enroll())).toBeTruthy();
});
it('captures either association order exactly and keeps own learner roster private',async()=>{
 await bound();await membership();const e=await enroll();const second=await enroll(student2);await membership(student2);
 const all=await get();expect(all.enrollments).toHaveLength(2);expect(all.enrollments.every((x:any)=>x.state==='confirmed')).toBe(true);
 const s=(await get(group,e)).snapshot;expect(s).toMatchObject({user_id:student,enrollment_id:e,source:'association_created',legal_enrollment_date:null});
 const exact=await get(group,e);expect(parseGroupProgramFacts(exact,org,group,e)).toEqual(exact);expect(parseGroupProgramFacts(all,org,group)).toEqual(all);
 await as(student);const own=await get(group,e);expect(own.enrollments).toHaveLength(1);expect(own.enrollments[0].enrollment_id).toBe(e);await denied('SELECT get_group_program_facts($1,$2,$3)',[org,group,second]);
});
it('freezes old group while global course version can change for future groups',async()=>{
 const v1=await bound();await membership();const e=await enroll();const original=(await get(group,e)).snapshot;
 const v2=await approved({rev:3,facts:{...facts,full_title:'Second programme',academic_hours:144}});await bindCourse(v2,1);await bindGroup(v2,group2);await membership(student,group2);
 expect((await get(group,e)).snapshot).toEqual(original);expect((await get(group2,e)).snapshot.version_id).toBe(v2.id);expect(original.version_id).toBe(v1.id);
 await denied(groupBindSql,[org,group,course,v2.id,1,req()],'22023');await db.exec('RESET ROLE');
 await denied('UPDATE student_groups SET course_id=NULL WHERE id=$1',[group],'22023');await db.query('UPDATE courses SET title=$1 WHERE id=$2',['Changed mutable title',course]);await as(owner);
 expect((await get(group,e)).snapshot).toEqual(original);
});
it('does not backfill old memberships; explicit confirmation records today without a legal date',async()=>{
 await membership();const e=await enroll();await bound();expect((await get(group,e)).state).toBe('unconfirmed');
 await db.exec('RESET ROLE');await db.query('UPDATE profiles SET student_group_id=student_group_id WHERE user_id=$1',[student]);await as(owner);expect((await get(group,e)).snapshot).toBeNull();
 const result=(await row('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4) d',[org,group,[e],req()])).d;
 expect(result.snapshots[0]).toMatchObject({source:'confirmed_existing_association',legal_enrollment_date:null,user_id:student});
});

it.each([reader,teacher,student,viewer])('denies programme configuration by %s without org-wide documents.write',async(u)=>{
 await as(u);await denied(createSql,args());await denied('SELECT list_program_facts_candidates($1)',[org]);
});
it('allows a multi-organization writer only within the authorized tenant',async()=>{
 await as(writer);expect((await create()).organization_id).toBe(org);await denied(createSql,args({org:other,program:id(90)}));
});
it('separates assigned group writers from org-wide programme and course administration',async()=>{
 const v=await approved();await bindCourse(v);await as(teacher);
 expect((await row('SELECT get_course_program_binding($1,$2) d',[org,course])).d.binding.version_id).toBe(v.id);
 expect((await bindGroup(v)).group_id).toBe(group);await denied(groupBindSql,[org,group2,course,v.id,0,req()]);
 await denied(courseBindSql,[org,course,v.id,1,req()]);await denied('SELECT get_group_program_facts($1,$2,NULL)',[org,group2]);
});
it('rejects anonymous and service-only callers and direct writes to private state',async()=>{
 for(const role of ['anon','service_role']){await as(null,role);await denied(createSql,args());await denied('SELECT list_program_facts($1)',[org]);}
 await as(owner);await denied("SELECT uc_mutate_program_facts('create','{}')");
 for(const t of ['program_fact_states','program_fact_versions','course_program_bindings','group_program_bindings','group_program_enrollment_snapshots','program_fact_events','program_fact_requests'])await denied('SELECT * FROM '+t);
});
it('creation and approval replay exact receipts but reject body/actor/request collisions',async()=>{
 const requestId=req();const originalArgs=args({request:requestId});const v=(await row(createSql,originalArgs)).d;
 expect((await row(createSql,originalArgs)).d).toEqual(v);await denied(createSql,args({request:requestId,facts:{...facts,academic_hours:144}}),'22023');
 await as(writer);await denied(createSql,originalArgs,'22023');await as(owner);
 const s=await transition(v,'submit');await as(reviewer);const approval=req();const a=await transition(s,'approve',{request:approval});expect(await transition(s,'approve',{request:approval})).toEqual(a);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM program_fact_versions')).n).toBe(1);
 expect((await row('SELECT count(*)::int n FROM program_fact_events')).n).toBe(3);
});
it('CAS rejects stale facts and binding changes; an unchanged request remains replayable',async()=>{
 const v=await approved();await denied(createSql,args({rev:0}),'40001');const key=req();const a=[org,course,v.id,0,key];
 const first=(await row(courseBindSql,a)).d;expect((await row(courseBindSql,a)).d).toEqual(first);
 await denied(courseBindSql,[org,course,v.id,0,req()],'40001');await bindGroup(v);await denied(groupBindSql,[org,group,course,v.id,0,req()],'40001');
});
it.each([teacher,reader,student,viewer,admin,id(999)])('does not accept %s as an ineligible reviewer',async(u)=>{
 await denied(createSql,args({reviewer:u}),'22023');
});
it('expired/revoked reviewers cannot approve or replay prior authority',async()=>{
 const v=await create();const s=await transition(v,'submit');await db.exec('RESET ROLE');
 await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id=$1",[reviewer]);await as(reviewer);await denied(transitionSql,[s.id,s.revision,'approve',null,req()]);
 await db.exec('RESET ROLE');await db.query('UPDATE org_staff SET expires_at=NULL WHERE user_id=$1',[reviewer]);await as(reviewer);
 const requestId=req();await transition(s,'approve',{request:requestId});await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[reviewer]);
 await as(reviewer);await denied(transitionSql,[s.id,s.revision,'approve',null,requestId]);
});
it('file approval alone never authorizes a forged or missing immutable object',async()=>{
 await denied(createSql,args({file:id(987)}),'22023');const v=await create();const s=await transition(v,'submit');
 await db.exec('RESET ROLE');await db.query("UPDATE storage.objects SET metadata='{\"size\":99}' WHERE id=(SELECT storage_object_id FROM org_document_versions WHERE id=$1)",[fileVersion]);
 await as(reviewer);await denied(transitionSql,[s.id,s.revision,'approve',null,req()],'22023');
});
it('old approved immutable file remains usable only through a new explicit facts review',async()=>{
 const original=fileVersion;const v1=await approved();fileVersion=await approveFile();expect(fileVersion).not.toBe(original);
 const v2=await create({rev:3,file:original,facts:{...facts,academic_hours:144}});expect(v2.state).toBe('draft');expect(v2.file_version_id).toBe(original);
 await denied(courseBindSql,[org,course,v2.id,0,req()],'22023');const s=await transition(v2,'submit');await as(reviewer);const a=await transition(s,'approve');await as(owner);
 expect((await bindCourse(a)).version_id).toBe(a.id);expect((await row('SELECT get_program_facts($1,$2) d',[org,program])).d.versions.find((v:any)=>v.id===v1.id).facts.academic_hours).toBe(72);
});
it('archive/trash retains exact historical evidence but cannot start a new facts review or binding',async()=>{
 const v=await bound();await membership();const e=await enroll();const d=await artifact();
 await db.exec('RESET ROLE');await db.query("UPDATE org_documents SET status='archived',deleted_at=clock_timestamp() WHERE id=$1",[doc]);
 expect((await row('SELECT uc_program_file_proof($1,$2) historical,uc_program_active_file_proof($1,$2) active',[org,fileVersion]))).toEqual({historical:true,active:false});
 await as(owner);expect((await get(group,e)).snapshot.version_id).toBe(v.id);
 expect((await row('SELECT list_program_facts_candidates($1) d',[org])).d.files).toEqual([]);
 await denied(createSql,args({rev:3}),'22023');
 await denied(courseBindSql,[org,course,v.id,1,req()],'22023');
 await denied(groupBindSql,[org,group2,course,v.id,0,req()],'22023');
 expect((await row(batchSql,[org,group,JSON.stringify([d])])).inserted_count).toBe(1);
 const issued=(await db.query<any>(issueSql,[org,group,course,JSON.stringify([issueItem(e)])])).rows[0];expect(issued.specialty_name).toBe(facts.full_title);
 await db.exec('RESET ROLE');await db.query("UPDATE storage.objects SET metadata='{}' WHERE id=(SELECT storage_object_id FROM org_document_versions WHERE id=$1)",[fileVersion]);
 await as(owner);await denied(batchSql,[org,group,JSON.stringify([d])],'40001');
});
it('a file archived after submit blocks approval without discarding the pending facts history',async()=>{
 const v=await create();const submitted=await transition(v,'submit');await db.exec('RESET ROLE');await db.query("UPDATE org_documents SET status='archived' WHERE id=$1",[doc]);
 await as(reviewer);await denied(transitionSql,[submitted.id,submitted.revision,'approve',null,req()],'22023');
 await as(owner);expect(parseProgramEnvelope((await row('SELECT get_program_facts($1,$2) d',[org,program])).d,org,program).current_version?.state).toBe('in_review');
});
it('expired current file metadata blocks new approval/binding while preserving historical programme evidence',async()=>{
 const v=await bound();await membership();const e=await enroll();const draft=await create({rev:3});const submitted=await transition(draft,'submit');
 await db.exec('RESET ROLE');await db.query("UPDATE org_documents SET expires_at=current_date-1 WHERE id=$1",[doc]);
 expect(await row('SELECT uc_program_file_proof($1,$2) historical,uc_program_active_file_proof($1,$2) active',[org,fileVersion])).toEqual({historical:true,active:false});
 await as(reviewer);await denied(transitionSql,[submitted.id,submitted.revision,'approve',null,req()],'22023');
 await as(owner);await denied(groupBindSql,[org,group2,course,v.id,0,req()],'22023');await denied(courseBindSql,[org,course,v.id,1,req()],'22023');
 expect(parseGroupProgramFacts(await get(group,e),org,group,e).snapshot?.version_id).toBe(v.id);
});
it('keeps immutable approved facts, event and snapshot history even against privileged accidental updates',async()=>{
 const v=await bound();await membership();const e=await enroll();await db.exec('RESET ROLE');
 await denied("UPDATE program_fact_versions SET facts='{}' WHERE id=$1",[v.id]);await denied('DELETE FROM program_fact_versions WHERE id=$1',[v.id]);
 await denied('UPDATE group_program_enrollment_snapshots SET user_id=$1 WHERE enrollment_id=$2',[student2,e]);await denied('DELETE FROM program_fact_events');
});
it('primary membership trigger creates the real enrollment and captures it once',async()=>{
 await bound();await db.exec('RESET ROLE');await db.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2',[group,student]);await as(owner);
 let g=await get();expect(g.enrollments).toHaveLength(1);expect(g.enrollments[0].state).toBe('confirmed');
 await db.exec('RESET ROLE');await db.query('UPDATE profiles SET student_group_id=student_group_id WHERE user_id=$1',[student]);await as(owner);
 expect((await get()).enrollments).toEqual(g.enrollments);expect((await get(group,g.enrollments[0].enrollment_id)).snapshot.legal_enrollment_date).toBeNull();
});
it('enrollment without a group remains accessible and acquires facts only on a later actual association',async()=>{
 await bound();const e=await enroll();await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM group_program_enrollment_snapshots')).n).toBe(0);
 await db.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2',[group,student]);await as(owner);expect((await get(group,e)).snapshot.source).toBe('association_created');
});
it('does not retarget an old snapshot when mutable enrollment identity changes',async()=>{
 await bound();await membership();const e=await enroll();const original=(await get(group,e)).snapshot;
 await membership(student2);await db.exec('RESET ROLE');await db.query('UPDATE enrollments SET user_id=$1 WHERE id=$2',[student2,e]);await as(owner);
 expect((await get(group,e)).snapshot).toBeNull();expect((await get(group,e)).state).toBe('unconfirmed');await db.exec('RESET ROLE');
 expect((await row('SELECT to_jsonb(s) d FROM group_program_enrollment_snapshots s WHERE id=$1',[original.id])).d).toEqual(original);
});
it('legacy enrollment deletion cannot erase the immutable history',async()=>{
 await bound();await membership();const e=await enroll();const original=(await get(group,e)).snapshot;await db.exec('RESET ROLE');await db.query('DELETE FROM enrollments WHERE id=$1',[e]);
 expect((await row('SELECT id FROM group_program_enrollment_snapshots WHERE id=$1',[original.id])).id).toBe(original.id);await as(owner);await denied('SELECT get_group_program_facts($1,$2,$3)',[org,group,e]);
});
it('explicit existing confirmation is all-or-nothing and cannot cross group or tenant',async()=>{
 await membership();const e=await enroll();await bound();const key=req();await denied('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4)',[org,group,[e,id(998)],key]);
 expect((await get(group,e)).snapshot).toBeNull();await denied(groupBindSql,[org,foreignGroup,course,(await row('SELECT get_course_program_binding($1,$2) d',[org,course])).d.binding.version_id,0,req()]);
 const a=[org,group,[e],key];const result=(await row('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4) d',a)).d;
 expect((await row('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4) d',a)).d).toEqual(result);
});
it('navigation never accepts foreign folders/categories or creates a parent cycle',async()=>{
 await as(admin);await db.query("INSERT INTO program_categories(id,organization_id,name)VALUES($1,$2,'Foreign')",[id(300),other]);
 await as(owner);await denied("INSERT INTO program_documents(organization_id,name,category_id)VALUES($1,'Bad',$2)",[org,id(300)]);
 await db.query("INSERT INTO program_folders(id,organization_id,name)VALUES($1,$2,'A')",[id(301),org]);await db.query("INSERT INTO program_folders(id,organization_id,name,parent_id)VALUES($1,$2,'B',$3)",[id(302),org,id(301)]);
 await denied('UPDATE program_folders SET parent_id=$1 WHERE id=$2',[id(302),id(301)],'22023');
});
it('legacy private bucket read has real document permission and cannot be overwritten even through broad policies',async()=>{
 await db.exec("RESET ROLE;CREATE POLICY uc_fixture_wide_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true)");
 const path='programs/'+org+'/legacy.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('program-files',$1,'{}')",[path]);
 await as(owner);expect((await row("SELECT count(*)::int n FROM storage.objects WHERE name=$1",[path])).n).toBe(1);
 await denied("INSERT INTO storage.objects(bucket_id,name)VALUES('program-files',$1)",['programs/'+org+'/new.pdf']);
 expect((await db.query("UPDATE storage.objects SET name='changed' WHERE name=$1 RETURNING id",[path])).rows).toHaveLength(0);
 expect((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[path])).rows).toHaveLength(0);
 for(const u of [teacher,student]){await as(u);expect((await row('SELECT count(*)::int n FROM storage.objects WHERE name=$1',[path])).n).toBe(0);}
});

async function artifact(users=[student]){
 const generation=parseGroupProgramGeneration(await get(),org,group,users);
 return {doc_type:'student_list',name:'Synthetic group document',doc_status:'draft',html:'Synthetic renderer result',variables:generation.fields?{...generation.fields,program_hours:String(generation.fields.program_hours)}:{},variables_snapshot:{program_facts:generation.provenance,student_user_ids:users}};
}
const batchSql='SELECT * FROM create_group_document_batch($1,$2,$3)';
it('actual generic batch stores the same authoritative proof as the shared renderer adapter',async()=>{
 await bound();await membership();await enroll();const d=await artifact();const result=await row(batchSql,[org,group,JSON.stringify([d])]);expect(result.inserted_count).toBe(1);
 const saved=await row('SELECT variables_snapshot FROM group_documents WHERE package_batch_id=$1',[result.batch_id]);expect(saved.variables_snapshot.program_facts).toEqual(d.variables_snapshot.program_facts);
 await db.exec('RESET ROLE');expect((await row('SELECT uc_program_document_proof($1,$2,$3) d',[org,group,[student]])).d).toEqual(d.variables_snapshot.program_facts);
});
it('forged scalar, hash, requested learner or stale binding rolls back the entire generic package',async()=>{
 const v=await bound();await membership();await enroll();const d=await artifact();await row(batchSql,[org,group,JSON.stringify([d])]);
 for(const bad of [{...d,variables:{...d.variables,program_hours:'900'}},{...d,variables_snapshot:{...d.variables_snapshot,program_facts:{...d.variables_snapshot.program_facts,binding_snapshot_hash:'0'.repeat(64)}}},{...d,variables_snapshot:{...d.variables_snapshot,student_user_ids:[student2]}}])
  await denied(batchSql,[org,group,JSON.stringify([{...d,doc_type:'schedule'},bad])],'40001');
 expect((await row('SELECT count(*)::int n FROM group_documents WHERE is_current')).n).toBe(1);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM program_fact_versions WHERE id=$1',[v.id])).n).toBe(1);
});
it('a programme changed during slow rendering cannot be committed using the old proof',async()=>{
 await bound();const d=await artifact([]);const v2=await approved({rev:3,facts:{...facts,academic_hours:144}});await bindCourse(v2,1);await bindGroup(v2,group,1);
 await denied(batchSql,[org,group,JSON.stringify([d])],'40001');expect((await row('SELECT count(*)::int n FROM group_documents')).n).toBe(0);
});
it('the shared projection and DB commit pin full facts and calendar after live course/group changes',async()=>{
 await bound();await membership();await enroll();const initial=parseGroupProgramGeneration(await get(),org,group,[student]);
 expect(initial.provenance.facts_snapshot).toEqual(facts);expect(initial.provenance.group_snapshot?.start_date).toBe('2026-11-01');
 await db.exec('RESET ROLE');await db.query("UPDATE student_groups SET start_date='2027-01-01',end_date='2027-02-01',name='Changed live group' WHERE id=$1",[group]);await db.query("UPDATE courses SET title='Changed live title' WHERE id=$1",[course]);await as(owner);
 const frozen=parseGroupProgramGeneration(await get(),org,group,[student]);expect(frozen).toEqual(initial);
 const d=await artifact();const vars={...d.variables,start_date:programDate(frozen.groupFields!.start_date),end_date:programDate(frozen.groupFields!.end_date),group_name:frozen.groupFields!.name};
 expect((await row(batchSql,[org,group,JSON.stringify([{...d,variables:vars}])])).inserted_count).toBe(1);
 await denied(batchSql,[org,group,JSON.stringify([{...d,variables:{...vars,start_date:'01.01.2027'}}])],'40001');
 await denied(batchSql,[org,group,JSON.stringify([{...d,variables_snapshot:{...d.variables_snapshot,program_facts:{...d.variables_snapshot.program_facts,group_snapshot:{...frozen.provenance.group_snapshot,start_date:'2027-01-01'}}}}])],'40001');
 const saved=await row('SELECT variables_snapshot FROM group_documents WHERE is_current');expect(saved.variables_snapshot.program_facts.group_snapshot.start_date).toBe('2026-11-01');expect(saved.variables_snapshot.program_facts.facts_snapshot.attestation_criteria).toBe(facts.attestation_criteria);
});
it('known DOCX calendar, attestation and selected-student scalars must match the same bound source',async()=>{
 await bound();await membership();await enroll();const generation=parseGroupProgramGeneration(await get(),org,group,[student]);const values=programGenerationScalars(generation);
 const snapshot={scalars:values,program_facts:generation.provenance,PROGRAM_HOURS:'72',programs:[{PROG_TITLE:facts.full_title,PROG_FORM:'Заочная',PROG_COUNT:'1'}],students:[{STUDENT_PROGRAM:facts.full_title,STUDENT_HOURS:'72',STUDENT_DATES:values.STUDENT_DATES}]};
 const sql="INSERT INTO org_contracts(id,organization_id,student_group_id,student_user_id,name,variables_snapshot,students,status)VALUES($1,$2,$3,$4,'Source-pinned DOCX',$5,$6,'active') RETURNING variables_snapshot";
 const a=(s:any)=>[req(),org,group,student,JSON.stringify(s),JSON.stringify([{user_id:student}])];
 expect((await row(sql,a(snapshot))).variables_snapshot.scalars.STUDENT_DATES).toBe('01.11.2026 — 14.11.2026');
 for(const key of ['START_DATE','START_DATE_RU','DAY1_DATE','SERVICE_END_DATE','SCHEDULE','ATTESTATION_CRITERIA','PROGRAM_DURATION_CALENDAR'])await denied(sql,a({...snapshot,scalars:{...values,[key]:'Forged current/caller value'}}),'40001');
 await denied(sql,a({...snapshot,students:[{...snapshot.students[0],STUDENT_DATES:'01.01.2027'}]}),'40001');
 await denied(sql,a({...snapshot,students:[{...snapshot.students[0],STUDENT_HOURS:'900'}]}),'40001');
});
it('known companion-document rows cannot claim another programme, hours or period',async()=>{
 await bound();await membership();await enroll();const generation=parseGroupProgramGeneration(await get(),org,group,[student]);
 const canonicalRow={STUDENT_PROGRAM:facts.full_title,STUDENT_HOURS:'72',STUDENT_PERIOD:programTrainingPeriod(generation),PROGRAM_GROUP:programGroupLabel(generation)};
 const snapshot={program_facts:generation.provenance,student_user_ids:[student],scalars:{...programGenerationScalars(generation),PROGRAM_TITLE:facts.full_title,PROGRAM_HOURS:'72',PROGRAM_FORM:'Заочная'},rows:[canonicalRow]};
 const sql="INSERT INTO group_documents(id,organization_id,group_id,doc_type,name,layout_format,doc_status,variables_snapshot)VALUES($1,$2,$3,'student_list','Source-pinned companion','docx_ooxml','draft',$4) RETURNING id";
 await db.exec('RESET ROLE');expect((await row(sql,[req(),org,group,JSON.stringify(snapshot)])).id).toBeTruthy();
 for(const key of ['STUDENT_PROGRAM','STUDENT_HOURS','STUDENT_PERIOD','PROGRAM_GROUP'])await denied(sql,[req(),org,group,JSON.stringify({...snapshot,rows:[{...canonicalRow,[key]:'Forged current/caller value'}]})],'40001');
});
it('unbound legacy rendering remains an honestly marked draft and cannot become final',async()=>{
 const result=await row(batchSql,[org,group,JSON.stringify([{doc_type:'student_list',name:'Legacy draft',doc_status:'draft',html:'Unconfirmed text'}])]);
 const saved=await row('SELECT id,variables_snapshot FROM group_documents WHERE package_batch_id=$1',[result.batch_id]);expect(saved.variables_snapshot.program_facts).toMatchObject({state:'unconfirmed',reason:'no_confirmed_group_binding'});
 await db.exec('RESET ROLE'); // Exercise the same BEFORE guard from a SECURITY DEFINER mutation path too.
 await denied("UPDATE group_documents SET doc_status='final' WHERE id=$1",[saved.id],'22023');
});
it('new unconfirmed contracts require both draft state and no official number',async()=>{
 const sql="INSERT INTO org_contracts(id,organization_id,student_group_id,name,status,contract_number)VALUES($1,$2,$3,'Unconfirmed','draft',$4) RETURNING variables_snapshot";
 expect((await row(sql,[req(),org,group,null])).variables_snapshot.program_facts.state).toBe('unconfirmed');
 await denied(sql,[req(),org,group,'FORGED/1'],'22023');
});
it('legacy final metadata can archive and recover without rewriting content or inventing a snapshot',async()=>{
 // Represent rows that existed before UC011, without disabling any older guard.
 await db.exec('RESET ROLE;ALTER TABLE group_documents DISABLE TRIGGER uc_program_artifact_guard;ALTER TABLE org_contracts DISABLE TRIGGER uc_program_artifact_guard');
 const legacy=req(),contract=req();await db.query("INSERT INTO group_documents(id,organization_id,group_id,doc_type,name,html,doc_status,status,document_number)VALUES($1,$2,$3,'student_list','Old final','Historical content','final','active','OLD/1')",[legacy,org,group]);
 await db.query("INSERT INTO org_contracts(id,organization_id,student_group_id,name,body_html,status,contract_number)VALUES($1,$2,$3,'Old contract','Historical contract','active','OLD/2')",[contract,org,group]);
 // group_documents intentionally has no permissive direct UPDATE policy. Exercise
 // the guard as a definer RPC would, retaining the real owner claims and checks.
 await db.exec('ALTER TABLE group_documents ENABLE TRIGGER uc_program_artifact_guard;ALTER TABLE org_contracts ENABLE TRIGGER uc_program_artifact_guard');await as(owner);await db.exec('RESET ROLE');
 await db.query("UPDATE group_documents SET status='archived',is_current=false WHERE id=$1",[legacy]);await db.query("UPDATE group_documents SET status='active',is_current=true WHERE id=$1",[legacy]);
 expect(await row('SELECT html,doc_status,status,is_current,document_number,variables_snapshot FROM group_documents WHERE id=$1',[legacy])).toEqual({html:'Historical content',doc_status:'final',status:'active',is_current:true,document_number:'OLD/1',variables_snapshot:null});
 await db.query("UPDATE org_contracts SET status='archived' WHERE id=$1",[contract]);expect((await row('SELECT variables_snapshot FROM org_contracts WHERE id=$1',[contract])).variables_snapshot).toBeNull();
 await denied("UPDATE org_contracts SET status='active' WHERE id=$1",[contract],'22023');
 await denied("UPDATE group_documents SET html='Changed' WHERE id=$1",[legacy],'22023');
 await denied("UPDATE group_documents SET document_number='NEW/1' WHERE id=$1",[legacy],'22023');
 const draft=(await row(batchSql,[org,group,JSON.stringify([{doc_type:'schedule',name:'Draft',doc_status:'draft'}])])).batch_id;
 await denied("UPDATE group_documents SET doc_status='final',status='archived' WHERE package_batch_id=$1",[draft],'22023');
});
it('contract commit checks exact selected learners, programme values and confirmed metadata',async()=>{
 await bound();await membership();await enroll();const d=await artifact();const vars={...d.variables,course_title:facts.full_title,course_hours:'72'};
 const sql="INSERT INTO org_contracts(id,organization_id,student_group_id,student_user_id,name,variables,variables_snapshot,students,status)VALUES($1,$2,$3,$4,'Synthetic contract',$5,$6,$7,'active') RETURNING variables_snapshot";
 const a=[req(),org,group,student,JSON.stringify(vars),JSON.stringify({program_facts:d.variables_snapshot.program_facts}),JSON.stringify([{user_id:student,full_name:'Synthetic'}])];
 expect((await row(sql,a)).variables_snapshot.program_facts).toEqual(d.variables_snapshot.program_facts);
 await denied(sql,[req(),...a.slice(1,4),JSON.stringify({...vars,course_hours:'999'}),...a.slice(5)],'40001');
});
it('compiler stage cannot bypass the programme guard and failed commit does not consume attestation',async()=>{
 const go='7237f9d4-3670-4a19-8946-a43c68fd3473',gu=req(),gg=req();await db.exec('RESET ROLE');
 await db.query("INSERT INTO organizations(id,name,inn)VALUES($1,'Synthetic ГОРЭЛТЕХ','7806541216')",[go]);await db.query('INSERT INTO profiles(user_id,organization_id)VALUES($1,$2)',[gu,go]);await db.query("INSERT INTO user_roles VALUES($1,'organization')",[gu]);await db.query("INSERT INTO student_groups(id,organization_id,name)VALUES($1,$2,'Synthetic')",[gg,go]);
 const kinds=['enrollment_order','expulsion_order','student_list','class_journal','schedule','attestation_sheet','registration_book','title_page','pass'];
 const documents=kinds.map((doc_type,i)=>({doc_type,name:'Synthetic '+doc_type,doc_status:'draft',document_number:null,layout_format:'docx_ooxml',file_path:`organizations/${go}/group-documents/${gg}/${req()}.docx`,template_registry_key:'synthetic-'+doc_type,template_version_label:'v1',template_sha256:'A'.repeat(64),docx_sha256:'B'.repeat(64),variables_snapshot:{...(i===8?{program_facts:{schema_version:1,state:'confirmed'}}:{})},generation_status:'generated',pdf_status:'unavailable'}));
 for(const d of documents)await db.query("INSERT INTO storage.objects(bucket_id,name)VALUES('billing-documents',$1)",[d.file_path]);
 await as(null,'service_role');await row('SELECT register_goreltech_group_document_stage($1,$2,$3,$4) d',[gu,go,gg,JSON.stringify(documents)]);await as(gu);
 await denied('SELECT * FROM create_goreltech_group_document_batch($1,$2,$3,$4)',[gu,go,gg,JSON.stringify(documents)],'40001');await db.exec('RESET ROLE');
 expect((await row('SELECT count(*)::int n FROM uc_goreltech_document_stages WHERE consumed_at IS NULL')).n).toBe(1);expect((await row('SELECT count(*)::int n FROM group_documents WHERE organization_id=$1',[go])).n).toBe(0);
 const valid=documents.map(d=>({...d,variables_snapshot:{}}));await as(null,'service_role');await row('SELECT register_goreltech_group_document_stage($1,$2,$3,$4) d',[gu,go,gg,JSON.stringify(valid)]);await as(gu);
 expect((await row('SELECT * FROM create_goreltech_group_document_batch($1,$2,$3,$4)',[gu,go,gg,JSON.stringify(valid)])).inserted_count).toBe(9);
});

const issueItem=(e:string,o:any={})=>({user_id:student,enrollment_id:e,document_type:'certificate',issue_date:'2026-10-18',full_name:'Synthetic Student',birth_date:'1990-01-01',specialty_name:'Untrusted mutable course title',qualification_name:'Caller qualification',...o});
const issueSql='SELECT * FROM issue_education_document_batch($1,$2,$3,$4)';
it('explicit issuance derives programme facts from the exact snapshot and replays without another number',async()=>{
 const v=await bound();await membership();const e=await enroll();const a=[org,group,course,JSON.stringify([issueItem(e)])];
 const issued=(await db.query<any>(issueSql,a)).rows[0];expect(issued).toMatchObject({specialty_name:facts.full_title,qualification_name:null,group_id:group,course_id:course,user_id:student,enrollment_id:e});
 const replay=(await db.query<any>(issueSql,a)).rows;expect(replay).toEqual([issued]);await db.exec('RESET ROLE');
 const source=await row('SELECT snapshot FROM education_document_program_sources WHERE record_id=$1',[issued.id]);expect(source.snapshot.version_id).toBe(v.id);
 expect((await row("SELECT sum(last_number)::int n FROM document_number_sequences WHERE organization_id=$1",[org])).n).toBe(2);
 await as(owner);await denied('UPDATE education_document_records SET specialty_name=$1 WHERE id=$2',['Forged',issued.id]);
});
it('issued metadata changes preserve the exact source and cannot rewrite names, numbers or dates',async()=>{
 await bound();await membership();const e=await enroll();const issued=(await db.query<any>(issueSql,[org,group,course,JSON.stringify([issueItem(e)])])).rows[0];await db.exec('RESET ROLE');
 const before=await row('SELECT snapshot FROM education_document_program_sources WHERE record_id=$1',[issued.id]);await as(owner);
 await db.query("UPDATE education_document_records SET delivery_method='postal',delivery_details='Synthetic receipt',deleted_at=clock_timestamp(),deleted_by=$1 WHERE id=$2",[owner,issued.id]);
 await db.query('UPDATE education_document_records SET deleted_at=NULL,deleted_by=NULL WHERE id=$1',[issued.id]);
 for(const [column,value] of [['full_name','Changed learner'],['document_number','FORGED/1'],['issue_date','2027-01-01'],['education_result','Invented result']])await denied('UPDATE education_document_records SET '+column+'=$1 WHERE id=$2',[value,issued.id]);
 await db.exec('RESET ROLE');expect(await row('SELECT snapshot FROM education_document_program_sources WHERE record_id=$1',[issued.id])).toEqual(before);
});
it('legacy issued delivery and trash metadata never manufacture a programme source',async()=>{
 await membership();const e=await enroll();await db.exec('RESET ROLE;ALTER TABLE education_document_records DISABLE TRIGGER uc_program_issuance_guard;ALTER TABLE education_document_records DISABLE TRIGGER uc_program_issuance_record');
 const old=req();await db.query("INSERT INTO education_document_records(id,organization_id,user_id,course_id,group_id,enrollment_id,full_name,document_type,document_number,reg_number,issue_date,specialty_name,document_status,delivery_method)VALUES($1,$2,$3,$4,$5,$6,'Historical learner','certificate','OLD/1','OLD/2','2026-01-01','Historical title','original','personal')",[old,org,student,course,group,e]);
 await db.exec('ALTER TABLE education_document_records ENABLE TRIGGER uc_program_issuance_guard;ALTER TABLE education_document_records ENABLE TRIGGER uc_program_issuance_record');await as(owner);
 await db.query("UPDATE education_document_records SET delivery_method='representative',delivery_details='Synthetic authority',deleted_at=clock_timestamp(),deleted_by=$1 WHERE id=$2",[owner,old]);
 await db.query('UPDATE education_document_records SET deleted_at=NULL,deleted_by=NULL WHERE id=$1',[old]);
 await denied("UPDATE education_document_records SET document_number='NEW/1' WHERE id=$1",[old],'22023');
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM education_document_program_sources WHERE record_id=$1',[old])).n).toBe(0);
 expect((await row('SELECT specialty_name FROM education_document_records WHERE id=$1',[old])).specialty_name).toBe('Historical title');
});
it('explicit issuance without approved association or with a wrong document type consumes no numbers',async()=>{
 await membership();const e=await enroll();await denied(issueSql,[org,group,course,JSON.stringify([issueItem(e)])],'22023');
 await bound();await row('SELECT confirm_group_program_enrollments($1,$2,$3,1,$4)',[org,group,[e],req()]);
 await denied(issueSql,[org,group,course,JSON.stringify([issueItem(e,{document_type:'diploma'})])],'22023');
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM education_document_records')).n).toBe(0);expect((await row('SELECT count(*)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).n).toBe(0);
});
async function completionSetup(){await db.exec('RESET ROLE');await db.query('INSERT INTO student_frdo_data(user_id,organization_id,birth_date)VALUES($1,$2,$3)',[student,org,'1990-01-01']);await db.query("UPDATE courses SET frdo_program_type='qualification_upgrade',frdo_qualification_name='Mutable qualification' WHERE id=$1",[course]);await as(owner);}
it('actual automatic issuance uses approved facts for one exact association',async()=>{
 await bound();await membership();const e=await enroll();await completionSetup();await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 expect((await row('SELECT specialty_name,qualification_name,group_id FROM education_document_records WHERE enrollment_id=$1',[e]))).toEqual({specialty_name:facts.full_title,qualification_name:null,group_id:group});
 expect((await row('SELECT count(*)::int n FROM education_document_program_sources')).n).toBe(1);
});
it('unknown legacy programme does not roll back actual completion or allocate an automatic document',async()=>{
 await membership();const e=await enroll();await completionSetup();await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 expect((await row('SELECT status FROM enrollments WHERE id=$1',[e])).status).toBe('completed');expect((await row('SELECT count(*)::int n FROM education_document_records')).n).toBe(0);
 expect((await row('SELECT count(*)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).n).toBe(0);
});
it('automatic issuance does not choose the first of several group associations',async()=>{
 const v=await bound();await bindGroup(v,group2);await membership();await membership(student,group2);const e=await enroll();await completionSetup();await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 expect((await row('SELECT status FROM enrollments WHERE id=$1',[e])).status).toBe('completed');expect((await row('SELECT count(*)::int n FROM education_document_records')).n).toBe(0);await as(owner);
 const issued=(await db.query<any>(issueSql,[org,group2,course,JSON.stringify([issueItem(e)])])).rows[0];expect(issued.group_id).toBe(group2);
 await denied(issueSql,[org,group,course,JSON.stringify([issueItem(e)])],'22023');
});
it('learner completion never receives the organization issuance action implicitly',async()=>{
 await bound();await membership();const e=await enroll();await completionSetup();await as(student);await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 expect((await row('SELECT status FROM enrollments WHERE id=$1',[e])).status).toBe('completed');expect((await row('SELECT count(*)::int n FROM education_document_records')).n).toBe(0);
});
it('missing exact bytes make provenance unavailable without blocking learning or allocating documents',async()=>{
 await bound();await membership();const e=await enroll();await completionSetup();await db.exec('RESET ROLE');
 await db.query("UPDATE storage.objects SET metadata='{}' WHERE id=(SELECT storage_object_id FROM org_document_versions WHERE id=$1)",[fileVersion]);
 await as(owner);const unavailable=parseGroupProgramFacts(await get(group,e),org,group,e);expect(unavailable).toMatchObject({state:'unconfirmed',reason:'exact_program_file_unavailable',capabilities:{can_confirm_existing:false}});expect(unavailable.snapshot?.enrollment_id).toBe(e);
 expect(()=>parseGroupProgramGeneration({...unavailable,enrollment_id:null,snapshot:null},org,group,[student])).toThrow();
 await membership(student2);const second=await enroll(student2);expect(await get(group,second)).toMatchObject({state:'unconfirmed',snapshot:null,reason:'exact_program_file_unavailable'});
 await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);
 expect((await row('SELECT status FROM enrollments WHERE id=$1',[e])).status).toBe('completed');expect((await row('SELECT count(*)::int n FROM education_document_records')).n).toBe(0);expect((await row('SELECT count(*)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).n).toBe(0);
});
it('approved source does not depend on mutable legacy FRDO course classification',async()=>{
 await bound();await membership();const e=await enroll();await completionSetup();await db.exec('RESET ROLE');await db.query('UPDATE courses SET frdo_program_type=NULL,frdo_qualification_name=NULL WHERE id=$1',[course]);
 await db.query("UPDATE enrollments SET status='completed' WHERE id=$1",[e]);expect(await row('SELECT document_type,specialty_name FROM education_document_records WHERE enrollment_id=$1',[e])).toEqual({document_type:'certificate',specialty_name:facts.full_title});
});
