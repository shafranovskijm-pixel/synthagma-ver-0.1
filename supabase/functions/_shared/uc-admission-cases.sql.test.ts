// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect}from 'vitest';
import type{PGlite}from '@electric-sql/pglite';
import{createUcAdmissionFixture,admissionBaseline}from './uc-admission-cases.fixture';
import{admissionCaseReadSchema,admissionMutationResultSchema,admissionOptionsSchema,admissionHistorySchema,admissionCandidatesSchema,admissionAssociationsSchema,admissionPreparationSchema}from '../../../src/lib/admissionCases/contract';
const id=(n:number)=>'f0000115-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),foreign=id(2),owner=id(3),sourceReviewer=id(4),student=id(5),writer=id(6),reader=id(7),teacher=id(8),viewer=id(9),sales=id(10),expired=id(11),revoked=id(12),writer2=id(13),oneRight=id(14),unknown=id(99);
const course=id(20),group=id(21),group2=id(22),enrollment=id(23),doc=id(24),localDoc=id(25),program=id(26),teacherStaff=id(27);
const facts={schema_version:1,full_title:'Synthetic reviewed programme',program_type:'dpo_upskilling',academic_hours:72,training_form:'part_time',uses_elearning:true,uses_distance_learning:true,duration_calendar:'Two weeks',attestation_form:'Final test',attestation_criteria:'Reviewed criteria',qualification:null,profession:null};
let db:PGlite,request=1000,localRef:any,caseRead:any;
const req=()=>id(++request);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false),set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const readCase=async(g=group,e=enrollment,user=student)=>(await row('SELECT read_student_admission_case($1,$2,$3) d',[org,user,JSON.stringify({mode:'case',group_id:g,enrollment_id:e})])).d;
const read=async(q:any)=>(await row('SELECT read_student_admission_case($1,$2,$3) d',[org,student,JSON.stringify(q)])).d;
const apply=async(command:any,requestId=req())=>(await row('SELECT apply_student_admission_case_action($1,$2,$3,$4) d',[org,student,requestId,JSON.stringify(command)])).d;
const command=(state:any,action:string,more:any={})=>({action,case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref,...more});
async function denied(sql:string,args:any[]=[],code='42501',message?:string){
 await db.exec('SAVEPOINT denied');try{await db.query(sql,args);throw Error('Expected denial');}catch(e:any){expect(e.code,e.message).toBe(code);if(message)expect(e.message).toBe(message);}finally{await db.exec('ROLLBACK TO denied');}
}
const denyAction=async(c:any,code='42501',requestId=req())=>denied('SELECT apply_student_admission_case_action($1,$2,$3,$4)',[org,student,requestId,JSON.stringify(c)],code);
const privateTables=['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests'];
async function privateHashes(){await db.exec('RESET ROLE');const result:any={};for(const t of privateTables)result[t]=(await row(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]')::text)hash FROM ${t} t`)).hash;return result;}
async function approveFile(documentId:string,type:string){
 const r=req(),path=org+'/versions/'+documentId+'/'+r+'.pdf';await db.exec('RESET ROLE');
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"synthetic-file\",\"mimetype\":\"application/pdf\"}')",[path]);
 await as(owner);await db.query("INSERT INTO org_documents(id,organization_id,name,type,status,file_url)VALUES($1,$2,'Synthetic reviewed source',$3,'active',NULL)",[documentId,org,type]);
 const v=(await row('SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5)d',[documentId,org,r,JSON.stringify({file_path:path,file_name:'Readable.pdf',file_size:42,change_summary:'Synthetic source'}),JSON.stringify({status:'active'})])).d;
 const dr=v.revision??v.document_revision??(await row('SELECT document_revision FROM org_documents WHERE id=$1',[documentId])).document_revision;
 let review=(await row('SELECT save_org_document_review_draft($1,$2,$3,0,$4,$5,$6,$7)d',[documentId,v.version_id,dr,owner,sourceReviewer,'[]',req()])).d;
 review=(await row("SELECT transition_org_document_review($1,$2,$3,'submit',NULL,NULL,NULL,$4)d",[review.id,review.revision,dr,req()])).d;
 await as(sourceReviewer);const approved=(await row("SELECT transition_org_document_review($1,$2,$3,'approve',NULL,'SYNTHETIC/115','2026-10-19',$4)d",[review.id,review.revision,dr,req()])).d;await as(owner);
 return{document_id:documentId,version_id:v.version_id,review_id:approved.id};
}
async function initialize(){await as(owner);const x=await readCase();return(await apply({action:'initialize',group_id:group,enrollment_id:enrollment,expected_program_ref:x.program_ref,expected_revision:0})).state;}
async function assigned(){let s=await initialize();s=(await apply(command(s,'assign_responsible',{responsible_id:writer,reason:'Назначен ответственный'}))).state;await as(writer);return s;}
const definitions=()=>['education_basis','application','contract_or_funding'].map((kind,i)=>({key:'question_'+i,kind,staff_label:'Private staff label '+i,source_version_ids:[localRef.version_id],provision:'Synthetic local clause '+i,exception_policy:'not_defined'}));
async function ruled(){const s=await assigned();return(await apply(command(s,'review_local_rules',{sources:[localRef],requirements:definitions(),review_reason:'Synthetic human review'}))).state;}
async function noFileApplicable(){let s=await ruled();for(const q of s.requirements)s=(await apply(command(s,'review_requirement',{requirement_id:q.id,expected_requirement_revision:q.revision,applicability:'not_applicable',evidence_version_ids:[],reason:'Human checked: no individual file applies to this synthetic case',exception:null}))).state;return s;}
async function prepareUpload(s:any,supersedes:string|null=null,requirement=s.requirements[0].id){
 const args=[s.id,s.revision,JSON.stringify(s.program_ref),req(),JSON.stringify({kind:'upload',requirement_id:requirement,supersedes_id:supersedes,declared_size:42,declared_mime:'application/pdf',declared_sha256:'a'.repeat(64)})];
 const p=(await row('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)d',args)).d;expect(admissionPreparationSchema.parse(p)).toEqual(p);return{p,args};
}
async function staged(s:any,supersedes:string|null=null){const{p,args}=await prepareUpload(s,supersedes);await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,$2,$3,$4,'{\"size\":42,\"mimetype\":\"application/pdf\"}')",[req(),p.upload_slot.bucket,p.upload_slot.path,writer]);return{p,args,commitRequest:req()};}
async function sealed(s:any,supersedes:string|null=null){const v=await staged(s,supersedes);const ctx=(await row('SELECT uc_admission_evidence_context($1,$2,$3,$4)d',[s.id,v.p.reservation_id,s.revision,v.commitRequest])).d;await as(null,'service_role');
 const objectId=req();await db.query("INSERT INTO storage.objects(id,bucket_id,name,metadata)VALUES($1,$2,$3,'{\"size\":42,\"mimetype\":\"application/pdf\"}')",[objectId,ctx.sealed.bucket,ctx.sealed.path]);const info=await row('SELECT updated_at FROM storage.objects WHERE id=$1',[objectId]);
 const args=[writer,s.id,v.p.reservation_id,s.revision,v.commitRequest,ctx.source.object_id,ctx.source.updated_at,ctx.source.fingerprint,objectId,info.updated_at,'a'.repeat(64),42,'application/pdf'];
 const att=(await row('SELECT uc_attest_admission_case_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)d',args)).d;expect(att.state).toBe('sealed');await as(writer);return{...v,ctx,att,args,objectId};
}
async function captured(s:any,supersedes:string|null=null){const v=await sealed(s,supersedes);const result=(await row('SELECT uc_finalize_admission_case_evidence($1,$2,$3,$4)d',[s.id,v.p.reservation_id,s.revision,v.commitRequest])).d;expect(admissionMutationResultSchema.parse(result)).toEqual(result);return{...v,result,state:result.state,evidence:result.state.evidence.find((e:any)=>e.id===v.p.evidence_version_id)};}
async function fileAccepted(){let s=await ruled();let v=await captured(s);s=v.state;const e=v.evidence,q=s.requirements.find((x:any)=>x.id===e.requirement_id);
 s=(await apply(command(s,'review_evidence',{requirement_id:q.id,expected_requirement_revision:q.revision,evidence_version_id:e.id,byte_sha256:e.byte_sha256,outcome:'accepted',reason:'Synthetic human checked sealed bytes'}))).state;
 for(const x of s.requirements)s=(await apply(command(s,'review_requirement',{requirement_id:x.id,expected_requirement_revision:x.revision,applicability:x.id===q.id?'applicable':'not_applicable',evidence_version_ids:x.id===q.id?[e.id]:[],reason:'Synthetic applicability checked',exception:null}))).state;return{...v,state:s};
}
async function tamperSealed(objectId:string,change="metadata='{}'"){
 await db.exec("RESET ROLE;ALTER TABLE storage.objects DISABLE TRIGGER uc_admission_storage_boundary");await db.query('UPDATE storage.objects SET '+change+' WHERE id=$1',[objectId]);await db.exec('ALTER TABLE storage.objects ENABLE TRIGGER uc_admission_storage_boundary');await as(writer);
}
beforeAll(async()=>{db=await createUcAdmissionFixture(true);},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic case A'),($2,'Synthetic case B')",[org,foreign]);
 for(const u of[owner,sourceReviewer,student,writer,reader,teacher,viewer,sales,expired,revoked,writer2,oneRight]){
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[u]);await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic profile')",[u,org]);
 }
 await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'organization'),($2,'student'),($3,'admin'),($4,'sales_manager')",[owner,student,viewer,sales]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 for(const u of[sourceReviewer,writer,writer2,expired,revoked,sales])await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.read\",\"students.write\",\"documents.read\",\"documents.write\"]')",[u,org]);
 await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.read\",\"documents.read\"]'),($3,$2,'custom','[\"students.read\",\"documents.read\",\"students.write\"]')",[reader,org,oneRight]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"students.read\",\"documents.read\",\"students.write\",\"documents.write\"]')",[teacherStaff,teacher,org]);
 await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day'WHERE user_id=$1",[expired]);await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[revoked]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Mutable source title')",[course,org]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Exact group'),($4,$2,$3,'Same course other group')",[group,org,course,group2]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
 const file=await approveFile(doc,'program_approval');localRef=await approveFile(localDoc,'admission_rules');
 let v=(await row('SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,0,$7)d',[org,program,'Synthetic programme',file.version_id,sourceReviewer,JSON.stringify(facts),req()])).d;
 v=(await row("SELECT transition_program_facts_version($1,$2,'submit',NULL,$3)d",[v.id,v.revision,req()])).d;await as(sourceReviewer);v=(await row("SELECT transition_program_facts_version($1,$2,'approve',NULL,$3)d",[v.id,v.revision,req()])).d;await as(owner);
 await row('SELECT bind_course_program_version($1,$2,$3,0,$4)d',[org,course,v.id,req()]);
 for(const g of[group,group2])await row('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)d',[org,g,course,v.id,req()]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$3)',[org,group,student,group2]);await db.query("INSERT INTO enrollments(id,user_id,course_id,status)VALUES($1,$2,$3,'active')",[enrollment,student,course]);await as(owner);caseRead=await readCase();
},30000);
afterEach(async()=>{await db?.exec('ROLLBACK;RESET ROLE');});
afterAll(async()=>{await db?.close();});
it('installs exactly six private case tables on the actual installed114 source baseline',async()=>{
 const row=(await db.query<any>("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'AND tablename IN('uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests')")).rows[0];expect(row.n).toBe(6);
});
it('removes arbitrary inherited default grants only from the exact new objects and preserves old overload ACLs, owners and global defaults',async()=>{
 const extraRoles=['uc115_unexpected_default','UC115 default "quoted"'];const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 let oldRelations:number[]=[],oldFunctions:number[]=[],defaultsBefore:any,oldBefore:any,installer:string|undefined;
 const defaults=async(d:PGlite)=>(await d.query<any>("SELECT coalesce(jsonb_agg(to_jsonb(a)ORDER BY a.oid),'[]')d FROM pg_default_acl a")).rows[0].d;
 const oldAcl=async(d:PGlite)=>({
  relations:(await d.query("SELECT oid,relowner,relacl::text FROM pg_class WHERE oid=ANY($1::oid[])ORDER BY oid",[oldRelations])).rows,
  columns:(await d.query("SELECT attrelid,attnum,attacl::text FROM pg_attribute WHERE attrelid=ANY($1::oid[])AND attnum>0 ORDER BY attrelid,attnum",[oldRelations])).rows,
  functions:(await d.query("SELECT oid,proowner,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[])ORDER BY oid",[oldFunctions])).rows,
 });
 const extra=await createUcAdmissionFixture(true,{beforeAdmission:async(d)=>{
  installer=(await d.query<any>('SELECT current_user name')).rows[0].name;
  for(const role of extraRoles){await d.exec('CREATE ROLE '+quote(role)+' NOLOGIN');await d.exec('GRANT USAGE ON SCHEMA public TO '+quote(role));
   await d.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO '+quote(role)+' WITH GRANT OPTION');
   await d.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO '+quote(role)+' WITH GRANT OPTION');}
  await d.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO PUBLIC,anon,authenticated,service_role');
  await d.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role');
  await d.exec("CREATE FUNCTION public.uc_admission_error(integer)RETURNS integer LANGUAGE sql AS 'SELECT $1+1'");
  await d.exec('GRANT SELECT(full_name)ON public.profiles TO '+quote(extraRoles[0])+' WITH GRANT OPTION');
  oldRelations=(await d.query<any>("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')ORDER BY c.oid")).rows.map(x=>x.oid);
  oldFunctions=(await d.query<any>("SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'ORDER BY p.oid")).rows.map(x=>x.oid);
  defaultsBefore=await defaults(d);oldBefore=await oldAcl(d);
 }});
 try{
  expect(await defaults(extra)).toEqual(defaultsBefore);expect(await oldAcl(extra)).toEqual(oldBefore);
  const rawTables=(d:PGlite)=>d.query("SELECT relname,relacl::text FROM pg_class WHERE oid=ANY(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY($1))ORDER BY relname",[privateTables]);
  expect((await rawTables(extra)).rows).toEqual((await rawTables(db)).rows);
  const tables=(await extra.query<any>("SELECT c.relname,pg_get_userbyid(c.relowner)owner,c.relrowsecurity,coalesce(jsonb_agg(jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable)ORDER BY a.privilege_type)FILTER(WHERE a.grantee=c.relowner),'[]')owner_acl,(SELECT jsonb_agg(jsonb_build_object('grantee',x.grantee,'grantor',x.grantor,'privilege_type',x.privilege_type,'is_grantable',x.is_grantable)ORDER BY x.privilege_type)FROM aclexplode(acldefault('r',c.relowner))x WHERE x.grantee=c.relowner)expected_owner_acl,count(*)FILTER(WHERE a.grantee<>c.relowner)::int nonowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE n.nspname='public'AND c.relname=ANY($1)GROUP BY c.oid ORDER BY c.relname",[privateTables])).rows;
  expect(tables).toHaveLength(6);for(const t of tables){expect(t.owner).toBe(installer);expect(t.relrowsecurity).toBe(true);expect(t.nonowner).toBe(0);expect(t.owner_acl).toEqual(t.expected_owner_acl);}
  const functions=(await extra.query<any>("SELECT p.oid,p.proname,pg_get_userbyid(p.proowner)owner,(SELECT jsonb_agg(to_jsonb(x)ORDER BY x.privilege_type)FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE x.grantee=p.proowner)owner_acl,(SELECT jsonb_agg(to_jsonb(x)ORDER BY x.privilege_type)FROM aclexplode(acldefault('f',p.proowner))x WHERE x.grantee=p.proowner)expected_owner_acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND NOT(p.oid=ANY($1::oid[]))ORDER BY p.proname",[oldFunctions])).rows;
  expect(functions).toHaveLength(49);for(const f of functions){expect(f.owner).toBe(installer);expect(f.owner_acl).toEqual(f.expected_owner_acl);}
  const grants=(await extra.query<any>("SELECT p.proname name,CASE WHEN a.grantee=0 THEN 'PUBLIC'ELSE pg_get_userbyid(a.grantee)END role,a.privilege_type privilege,a.is_grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE n.nspname='public'AND NOT(p.oid=ANY($1::oid[]))AND a.grantee<>p.proowner ORDER BY p.proname,role",[oldFunctions])).rows;
  const auth=['read_student_admission_case','apply_student_admission_case_action','prepare_admission_case_evidence','uc_admission_evidence_context','uc_finalize_admission_case_evidence','uc_admission_evidence_file_context','uc_admission_stage_allowed'];
  const expected=[...auth.map(name=>({name,role:'authenticated',privilege:'EXECUTE',is_grantable:false})),{name:'uc_attest_admission_case_evidence',role:'service_role',privilege:'EXECUTE',is_grantable:false},{name:'uc_admission_stage_allowed',role:'anon',privilege:'EXECUTE',is_grantable:false}].sort((a,b)=>a.name.localeCompare(b.name)||a.role.localeCompare(b.role));expect(grants).toEqual(expected);
  for(const role of extraRoles){await extra.exec('RESET ROLE;SET ROLE '+quote(role));expect((await extra.query<any>("SELECT has_schema_privilege(current_user,'public','USAGE')allowed")).rows[0].allowed).toBe(true);
   for(const table of privateTables){await expect(extra.query('SELECT * FROM public.'+quote(table))).rejects.toMatchObject({code:'42501'});await expect(extra.query('INSERT INTO public.'+quote(table)+' DEFAULT VALUES')).rejects.toMatchObject({code:'42501'});}
   await expect(extra.query("SELECT public.uc_admission_trim('private')")).rejects.toMatchObject({code:'42501'});
   expect((await extra.query<any>('SELECT public.uc_admission_error(41::integer)answer')).rows[0].answer).toBe(42);
  }
 }finally{await extra.close();}
},30000);
it('first initialized result is strict boolean DTO with no unassigned review/decision grant',async()=>{
 const s=await initialize();expect(s.capabilities).toMatchObject({can_assign:true,can_review:false,can_decide:false,can_configure_rules:false});expect(s.responsible_id).toBeNull();
 expect(admissionCaseReadSchema.parse(await readCase()).state).toEqual(s);
 const h=await read({mode:'history',case_id:s.id,ceiling_revision:null,before_revision:null,limit:25});expect(admissionHistorySchema.parse(h)).toEqual(h);expect(h.items[0].payload.responsible_id).toBeNull();
});
it('complete synthetic case uses approved public UC010/UC011 workflows and human action rules without seeding new state',async()=>{
 const s=await noFileApplicable();const result=await apply(command(s,'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[],outcome:'admitted',reason:'Explicit synthetic assigned-human conclusion'}));
 expect(admissionMutationResultSchema.parse(result)).toEqual(result);expect(result.state.decision.outcome).toBe('admitted');expect(result.state.program_title).toBe(facts.full_title);expect(result.state.tasks).toHaveLength(0);
 await as(student);const own=await readCase();expect(admissionCaseReadSchema.parse(own)).toEqual(own);expect(own.projection).toBe('learner');expect(own.state.outcome).toBe('admitted');expect(JSON.stringify(own)).not.toContain('Private staff label');
});
it('unknown applicability cannot become admitted from programme type or empty evidence',async()=>{
 const s=await ruled();await denyAction(command(s,'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[],outcome:'admitted',reason:'Must refuse unknown'}),'P0001');
 expect((await readCase()).state.revision).toBe(s.revision);
});
it('two groups with one enrollment create independent exact cases',async()=>{
 const s=await initialize();const r=await readCase(group2);const other=(await apply({action:'initialize',group_id:group2,enrollment_id:enrollment,expected_program_ref:r.program_ref,expected_revision:0})).state;
 expect(other.id).not.toBe(s.id);expect(other.scope.group_id).toBe(group2);expect(other.program_ref.enrollment_snapshot_id).not.toBe(s.program_ref.enrollment_snapshot_id);
 expect(admissionAssociationsSchema.parse(await read({mode:'associations',after_id:null,limit:1})).has_more).toBe(true);
});
it.each([reader,oneRight,viewer,sales,expired,revoked,student,unknown])('denies initialization for ineligible original actor %s',async(u)=>{
 await as(u);await denyAction({action:'initialize',group_id:group,enrollment_id:enrollment,expected_program_ref:caseRead.program_ref,expected_revision:0});
});
it('assigned teacher scope never expands to another group on the same course',async()=>{
 const s=await initialize();await as(teacher);expect(admissionCaseReadSchema.parse(await readCase()).projection).toBe('staff');await denied('SELECT read_student_admission_case($1,$2,$3)',[org,student,JSON.stringify({mode:'case',group_id:group2,enrollment_id:enrollment})]);
 await as(owner);await denyAction(command(s,'assign_responsible',{responsible_id:student,reason:'Self-approval must fail'}));
});
it('current responsible is rechecked before exact historical review/decision replay',async()=>{
 let s=await ruled();const requestId=req();const input=command(s,'review_requirement',{requirement_id:s.requirements[0].id,expected_requirement_revision:1,applicability:'not_applicable',evidence_version_ids:[],reason:'Prior review',exception:null});s=(await apply(input,requestId)).state;
 expect((await apply(input,requestId)).replayed).toBe(true);await as(owner);s=(await apply(command(s,'assign_responsible',{responsible_id:writer2,reason:'Reassigned'}))).state;await as(writer);await denyAction(input,'42501',requestId);expect((await readCase()).state.responsible_id).toBe(writer2);
});
it('private create-only stage seals actual attestation then commits exactly one evidence/event/receipt with exact ABI keys',async()=>{
 const s=await ruled(),v=await captured(s);expect(v.evidence).toMatchObject({review:'unreviewed',availability:'available',can_read_bytes:true,byte_sha256:'a'.repeat(64)});expect(v.state.revision).toBe(s.revision+1);
 const replay=(await row('SELECT uc_finalize_admission_case_evidence($1,$2,$3,$4)d',[s.id,v.p.reservation_id,s.revision,v.commitRequest])).d;expect(replay.receipt).toEqual(v.result.receipt);expect(replay.replayed).toBe(true);
 const ctx=(await row('SELECT uc_admission_evidence_context($1,$2,$3,$4)d',[s.id,v.p.reservation_id,s.revision,v.commitRequest])).d;expect(ctx.mode).toBe('consumed');expect(ctx.replay_result).toEqual(replay);expect(Object.keys(ctx).sort()).toEqual(['schema_version','mode','actor_id','scope','case_id','case_revision','expected_revision','reservation_id','evidence_version_id','requirement_id','supersedes_id','request_id','expires_at','source_kind','source','sealed','replay_result'].sort());
 await db.exec('RESET ROLE');expect((await row("SELECT count(*)::int n FROM uc_admission_case_requests WHERE kind='_context'")).n).toBe(0);
});
it('prepare replay preserves original reservation and expiry without a business revision increment',async()=>{
 const s=await ruled(),v=await prepareUpload(s);expect((await row('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)d',v.args)).d).toEqual(v.p);expect((await readCase()).state.revision).toBe(s.revision);
 await denied('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)',[...v.args.slice(0,4),JSON.stringify({...JSON.parse(v.args[4]as string),declared_size:41})],'40001');
});
it.each(['metadata=\'{"size":41,"mimetype":"application/pdf"}\'','updated_at=updated_at+interval \'1 second\''])('stale sealed attestation cannot finalize after exact object drift: %s',async(change)=>{
 const s=await ruled(),v=await sealed(s);await tamperSealed(v.objectId,change);
 await denied('SELECT uc_finalize_admission_case_evidence($1,$2,$3,$4)',[s.id,v.p.reservation_id,s.revision,v.commitRequest],'P0001');
 expect((await readCase()).state.revision).toBe(s.revision);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM uc_admission_case_evidence')).n).toBe(0);
});
it('current read reflects sealed drift without writing, marks later review, and stale readiness cannot admit',async()=>{
 const v=await fileAccepted(),s=v.state;expect(s.requirements[0].current_state).toBe('satisfied');const input=command(s,'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[v.evidence.id],outcome:'admitted',reason:'Synthetic decision'});
 const decision=await apply(input);await tamperSealed(v.objectId);const hashes=await privateHashes();await as(writer);const fresh=(await readCase()).state;expect(fresh.evidence[0].availability).toBe('unavailable');expect(fresh.requirements[0].current_state).toBe('unreadable');expect(fresh.decision.later_review_required).toBe(true);expect(fresh.tasks[0].kind).toBe('recheck_source');
 expect((await readCase()).state.tasks[0].id).toBe(fresh.tasks[0].id);
 await as(student);const learner=await readCase();expect(learner.state.later_review_required).toBe(true);expect(learner.state.tasks[0].next_action).toBe('contact_staff');expect(JSON.stringify(learner)).not.toContain('Private staff label');expect(JSON.stringify(learner)).not.toContain('Synthetic applicability');expect(await privateHashes()).toEqual(hashes);await as(writer);
 await denyAction(command({...s,revision:decision.state.revision},'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[v.evidence.id],outcome:'admitted',reason:'Must fail drift'}),'P0001');
 expect((await readCase()).state.revision).toBe(decision.state.revision);
});
it('replacement preserves historical byte metadata and file-context access while denying learner sealed bytes',async()=>{
 const v=await fileAccepted();const next=await captured(v.state,v.evidence.id);expect(next.state.evidence.map((e:any)=>e.id)).toEqual([next.evidence.id]);
 const h=await read({mode:'history',case_id:v.state.id,ceiling_revision:null,before_revision:null,limit:50});expect(admissionHistorySchema.parse(h)).toEqual(h);expect(h.items.some((e:any)=>e.payload.evidence.some((x:any)=>x.id===v.evidence.id&&x.byte_sha256===v.evidence.byte_sha256&&x.can_read_bytes))).toBe(true);
 const old=(await row('SELECT uc_admission_evidence_file_context($1,$2)d',[v.state.id,v.evidence.id])).d;expect(old.evidence_version_id).toBe(v.evidence.id);expect(old.object.path).toContain('/sealed/');
 await as(student);await denied('SELECT uc_admission_evidence_file_context($1,$2)',[v.state.id,v.evidence.id]);expect((await db.query('SELECT id FROM storage.objects WHERE id=$1',[v.objectId])).rows).toEqual([]);
});
it('rule replacement preserves historic conclusions, increments stable requirement revisions, resets current acceptance',async()=>{
 const v=await fileAccepted(),s=v.state;const updated=(await apply(command(s,'review_local_rules',{sources:[localRef],requirements:definitions(),review_reason:'New explicit human rule version'}))).state;
 expect(updated.requirements.map((q:any)=>q.id)).toEqual(s.requirements.map((q:any)=>q.id));expect(updated.requirements.map((q:any)=>q.revision)).toEqual([2,2,2]);expect(updated.requirements.every((q:any)=>q.applicability==='unknown')).toBe(true);expect(updated.evidence[0].review).toBe('unreviewed');
});
it('operational membership loss preserves history but denies all case/history/media paths',async()=>{
 const v=await captured(await ruled());await db.exec('RESET ROLE');await db.query('DELETE FROM student_group_memberships WHERE organization_id=$1 AND group_id=$2 AND user_id=$3',[org,group,student]);await as(writer);
 await denied('SELECT read_student_admission_case($1,$2,$3)',[org,student,JSON.stringify({mode:'history',case_id:v.state.id,ceiling_revision:null,before_revision:null,limit:25})]);await denied('SELECT uc_admission_evidence_file_context($1,$2)',[v.state.id,v.evidence.id]);
 await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM uc_admission_cases WHERE id=$1',[v.state.id])).n).toBe(1);expect((await row('SELECT count(*)::int n FROM uc_admission_case_evidence WHERE id=$1',[v.evidence.id])).n).toBe(1);
});
it('source candidates remain individual and unsupported organization/shared artifacts request a copy',async()=>{
 const s=await ruled();const path=student+'/identity.pdf',sourceId=req();await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('student-documents',$1,'{\"size\":42,\"mimetype\":\"application/pdf\"}')",[path]);await db.query("INSERT INTO student_identity_documents(id,user_id,organization_id,type,name,file_path,file_url)VALUES($1,$2,$3,'passport','Synthetic individual',$4,$4)",[sourceId,student,org,path]);await as(writer);
 const options=await read({mode:'candidates',case_id:s.id,kind:'identity_document',after_id:null,limit:25});expect(admissionCandidatesSchema.parse(options)).toEqual(options);expect(options.items[0].availability).toBe('capturable');
 const orgDoc=await read({mode:'candidates',case_id:s.id,kind:'organization_document_version',after_id:null,limit:25});expect(orgDoc.items.every((x:any)=>x.availability==='needs_individual_copy')).toBe(true);
});
it('unknown source URL host is unavailable even when same local path exists; exact attested legacy host works',async()=>{
 const s=await ruled(),sourceId=req(),path=student+'/known.pdf';await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('student-documents',$1,'{\"size\":42,\"mimetype\":\"application/pdf\"}')",[path]);await db.query("INSERT INTO student_identity_documents(id,user_id,organization_id,type,name,file_url)VALUES($1,$2,$3,'passport','Synthetic URL',$4)",[sourceId,student,org,'https://unknown.invalid/storage/v1/object/public/student-documents/'+path]);await as(writer);
 let list=await read({mode:'candidates',case_id:s.id,kind:'identity_document',after_id:null,limit:25});expect(list.items[0].availability).toBe('unavailable');
 await db.exec('RESET ROLE');await db.query('UPDATE student_identity_documents SET file_url=$1 WHERE id=$2',['https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/authenticated/student-documents/'+path,sourceId]);await as(writer);list=await read({mode:'candidates',case_id:s.id,kind:'identity_document',after_id:null,limit:25});expect(list.items[0].availability).toBe('capturable');
});
it('trusted full subject erasure inventories stage/sealed copies and removes all six registries without breaking old wrapper',async()=>{
 const v=await captured(await ruled());await db.exec('RESET ROLE');const files=(await row('SELECT account_deletion_files($1)files',[student])).files;expect(files.filter((x:any)=>x.bucket==='admission-case-evidence')).toHaveLength(2);
 expect((await row('SELECT account_deletion_snapshot($1)snapshot',[student])).snapshot.categories.some((x:any)=>x.key==='admission_cases')).toBe(true);
 await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[student]);const job=req();await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'synthetic-case-subject','full-personal-data-v1','cleanup_pending',$2,'{}',$3,false)",[job,student,JSON.stringify(files)]);
 await as(null,'service_role');for(const f of files.filter((x:any)=>x.bucket==='admission-case-evidence'))await db.query('DELETE FROM storage.objects WHERE id=$1',[f.objectId]);
 expect((await row("SELECT account_deletion_erase_data($1,'synthetic-case-subject')d",[job])).d).toEqual({erased:true});await db.exec('RESET ROLE');
 for(const t of privateTables)expect((await row(`SELECT count(*)::int n FROM ${t}`)).n).toBe(0);
});
it('reviewer erasure removes staff IDs and stage paths from foreign case attribution while retaining sealed version/history',async()=>{
 const v=await captured(await ruled());await db.exec('RESET ROLE');const staffId=(await row('SELECT id FROM org_staff WHERE user_id=$1',[writer])).id;
 const files=(await row('SELECT account_deletion_files($1)files',[writer])).files;expect(files.some((x:any)=>x.path===v.p.upload_slot.path)).toBe(true);expect(files.some((x:any)=>x.objectId===v.objectId)).toBe(false);
 await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[writer]);const job=req();await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'synthetic-case-reviewer','full-personal-data-v1','cleanup_pending',$2,'{}',$3,false)",[job,writer,JSON.stringify(files)]);
 await as(null,'service_role');for(const f of files.filter((x:any)=>x.bucket==='admission-case-evidence'))await db.query('DELETE FROM storage.objects WHERE id=$1',[f.objectId]);
 expect((await row("SELECT account_deletion_erase_data($1,'synthetic-case-reviewer')d",[job])).d).toEqual({erased:true});await db.exec('RESET ROLE');
 for(const t of privateTables){const text=JSON.stringify((await db.query(`SELECT to_jsonb(t)d FROM ${t} t`)).rows);expect(text,t).not.toContain(writer);expect(text,t).not.toContain(staffId);}
 const e=await row('SELECT * FROM uc_admission_case_evidence WHERE id=$1',[v.evidence.id]);expect(e.captured_by).toBeNull();expect(e.source_redacted).toBe(true);expect(e.source_snapshot.proof.path).toBeNull();expect((await row('SELECT count(*)::int n FROM storage.objects WHERE id=$1',[v.objectId])).n).toBe(1);
 await as(owner);const state=(await readCase()).state;expect(state.responsible_id).toBeNull();expect(state.evidence[0].id).toBe(v.evidence.id);expect(state.tasks.some((t:any)=>t.kind==='recheck_source')).toBe(true);
});
it.each(['anon','authenticated','service_role'])('direct private CRUD/history/context helpers stay denied to %s',async(role)=>{
 await as(role==='authenticated'?owner:null,role);for(const t of privateTables)await denied('SELECT * FROM '+t);await denied("SELECT uc_admission_context($1,$2,'mutation')",[id(999),owner]);await denied('SELECT uc_erase_admission_cases($1)',[student]);
});
it('new state cannot be modified with forged GUC or a former authenticated context',async()=>{
 const s=await ruled();await db.exec("SELECT set_config('sintagma.account_deletion_erase_user','"+student+"',true)");await denied("UPDATE uc_admission_cases SET revision=revision+1 WHERE id=$1",[s.id]);
 await db.exec('RESET ROLE');await denied("UPDATE uc_admission_cases SET revision=revision+1 WHERE id=$1",[s.id]);
});
it('actual internal proof locks are NOWAIT and normal storage cannot overwrite sealed or rename stages',async()=>{
 const v=await captured(await ruled());expect((await db.query("UPDATE storage.objects SET metadata='{}'WHERE id=$1 RETURNING id",[v.objectId])).rows).toEqual([]);expect((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[v.objectId])).rows).toEqual([]);await as(null,'service_role');await denied("UPDATE storage.objects SET metadata='{}'WHERE id=$1",[v.objectId]);await denied('DELETE FROM storage.objects WHERE id=$1',[v.objectId]);
 await db.exec('RESET ROLE');for(const signature of['uc_admission_lock_source(uuid)','uc_admission_lock_rules(jsonb)'])expect((await row('SELECT pg_get_functiondef($1::regprocedure)body',[signature])).body).toContain('FOR SHARE NOWAIT');
});
it('changed current local act blocks new decision and asks for recheck without rewriting history',async()=>{
 const s=await noFileApplicable();await db.exec('RESET ROLE');await db.query("UPDATE org_documents SET status='archived'WHERE id=$1",[localDoc]);await as(writer);const current=(await readCase()).state;expect(current.tasks.some((t:any)=>t.kind==='recheck_source')).toBe(true);expect(current.prerequisites[0].code).toBe('rule_set_unreviewed');
 await denyAction(command(s,'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[],outcome:'admitted',reason:'Cannot use changed local source'}),'P0001');
});
it.each([null,[],{action:'bogus'},{action:'initialize',extra:true}])('malformed public command is normalized and cannot create a case: %j',async(c)=>{
 await denyAction(c,'22023');await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM uc_admission_cases')).n).toBe(0);
});
it('stale CAS, same request changed body and reassignment preserve immutable receipt and no extra revision',async()=>{
 const s=await initialize(),requestId=req(),input=command(s,'assign_responsible',{responsible_id:writer,reason:'Assigned once'}),result=await apply(input,requestId);
 expect((await apply(input,requestId)).receipt).toEqual(result.receipt);await denyAction({...input,reason:'Changed body'},'40001',requestId);await denyAction({...input,responsible_id:writer2},'40001');expect((await readCase()).state.revision).toBe(result.state.revision);
});
it('a canonical learner never satisfies explicit staff self-approval even with a misleading ownership pointer',async()=>{
 await db.exec('RESET ROLE');expect((await row('SELECT uc_identification_target_allowed($1,$2,true)ok',[org,student])).ok).toBe(true);
 expect((await row('SELECT uc_admission_staff_allowed($1,$2,$1,$3,$4,true)ok',[student,org,group,enrollment])).ok).toBe(false);
 expect((await row("SELECT pg_get_functiondef('is_org_owner(uuid,uuid)'::regprocedure)body")).body).not.toContain('organizations');
});
it('no-account, banned or deleted proposed responsibles cannot be assigned or appear as options',async()=>{
 const s=await initialize();await db.exec('RESET ROLE');await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.read\",\"students.write\",\"documents.read\",\"documents.write\"]')",[unknown,org]);
 for(const[field,value]of[['banned_until',"now()+interval '1 day'"],['deleted_at','now()']]){await db.exec('SAVEPOINT inactive');await db.query('UPDATE auth.users SET '+field+'='+value+' WHERE id=$1',[writer]);await as(owner);await denyAction(command(s,'assign_responsible',{responsible_id:writer,reason:'Inactive forbidden'}));await db.exec('RESET ROLE;ROLLBACK TO inactive');}
 await as(owner);await denyAction(command(s,'assign_responsible',{responsible_id:unknown,reason:'No account forbidden'}));const options=await read({mode:'options',case_id:s.id,kind:'responsibles',after_id:null,limit:50});expect(admissionOptionsSchema.parse(options)).toEqual(options);expect(options.items.some((x:any)=>x.user_id===unknown)).toBe(false);
});
it('default readonly teacher needs explicit both writes and exact assignment before responsibility',async()=>{
 const s=await initialize();await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.read\",\"documents.read\"]'WHERE user_id=$1",[teacher]);await as(owner);await denyAction(command(s,'assign_responsible',{responsible_id:teacher,reason:'Teacher must be explicit'}));
 await as(teacher);expect((await readCase()).capabilities.can_initialize).toBe(false);await denyAction(command(s,'assign_responsible',{responsible_id:teacher,reason:'Cannot elevate self'}));
});
it.each(['user','org','group','enrollment'])('wrong exact %s scope never yields a case or replay',async(which)=>{
 const s=await ruled();await as(owner);const q={mode:'case',group_id:which==='group'?unknown:group,enrollment_id:which==='enrollment'?unknown:enrollment};await denied('SELECT read_student_admission_case($1,$2,$3)',[which==='org'?foreign:org,which==='user'?unknown:student,JSON.stringify(q)]);
 if(which==='org'||which==='user')await denied('SELECT apply_student_admission_case_action($1,$2,$3,$4)',[which==='org'?foreign:org,which==='user'?unknown:student,req(),JSON.stringify(command(s,'assign_responsible',{responsible_id:writer2,reason:'Scope cannot change'}))]);
});
it('original source bytes can be captured only from exact individual current candidate fingerprint',async()=>{
 const s=await ruled(),sourceId=req(),path=student+'/capture-existing.pdf';await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('student-documents',$1,'{\"size\":42,\"mimetype\":\"application/pdf\"}')",[path]);await db.query("INSERT INTO student_identity_documents(id,user_id,organization_id,type,name,file_path,file_url)VALUES($1,$2,$3,'passport','Individual copy',$4,$4)",[sourceId,student,org,path]);await as(writer);
 const list=await read({mode:'candidates',case_id:s.id,kind:'identity_document',after_id:null,limit:25}),candidate=list.items[0],requestId=req();
 const args=[s.id,s.revision,JSON.stringify(s.program_ref),requestId,JSON.stringify({kind:'existing',requirement_id:s.requirements[0].id,supersedes_id:null,candidate:{kind:candidate.kind,id:candidate.id,version_id:null,fingerprint:candidate.fingerprint}})];
 const p=(await row('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)d',args)).d;expect(p.upload_slot).toBeNull();const commitRequest=req(),ctx=(await row('SELECT uc_admission_evidence_context($1,$2,$3,$4)d',[s.id,p.reservation_id,s.revision,commitRequest])).d;expect(ctx.source.bucket).toBe('student-documents');expect(ctx.source.known_sha256).toBeNull();
 await db.exec('RESET ROLE');await db.query("UPDATE student_identity_documents SET name='Changed mutable source'WHERE id=$1",[sourceId]);await as(writer);await denied('SELECT uc_admission_evidence_context($1,$2,$3,$4)',[s.id,p.reservation_id,s.revision,commitRequest],'P0001');
});
it('unsealed, expired, foreign reservation and forged attestation hashes cannot finalize',async()=>{
 const s=await ruled(),v=await staged(s);await denied('SELECT uc_finalize_admission_case_evidence($1,$2,$3,$4)',[s.id,v.p.reservation_id,s.revision,v.commitRequest],'P0001');await as(writer2);await denied('SELECT uc_admission_evidence_context($1,$2,$3,$4)',[s.id,v.p.reservation_id,s.revision,v.commitRequest]);
 await db.exec('RESET ROLE;ALTER TABLE uc_admission_evidence_reservations DISABLE TRIGGER uc_admission_history_guard');await db.query("UPDATE uc_admission_evidence_reservations SET expires_at=clock_timestamp()-interval '1 second'WHERE id=$1",[v.p.reservation_id]);await db.exec('ALTER TABLE uc_admission_evidence_reservations ENABLE TRIGGER uc_admission_history_guard');await as(writer);await denied('SELECT uc_admission_evidence_context($1,$2,$3,$4)',[s.id,v.p.reservation_id,s.revision,v.commitRequest],'P0001');
});
it('service with nonnull uid cannot attest, and service attestation cannot be called by original authenticated actor',async()=>{
 const s=await ruled(),v=await sealed(s);await as(owner,'service_role');await denied('SELECT uc_attest_admission_case_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',v.args);await as(writer);await denied('SELECT uc_attest_admission_case_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',v.args);
});
it('CAS/changed sealed proof rolls back service attestation without a business event',async()=>{
 const s=await ruled(),v=await sealed(s);await as(null,'service_role');const bad=[...v.args];bad[10]='b'.repeat(64);await denied('SELECT uc_attest_admission_case_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',bad,'P0001');await db.exec('RESET ROLE');expect((await row("SELECT count(*)::int n FROM uc_admission_case_events WHERE kind='evidence_committed'")).n).toBe(0);
});
it('expired uncommitted orphan cleanup cannot remove any committed sealed object',async()=>{
 const s=await ruled(),v=await staged(s);await db.exec('RESET ROLE;ALTER TABLE uc_admission_evidence_reservations DISABLE TRIGGER uc_admission_history_guard');await db.query("UPDATE uc_admission_evidence_reservations SET expires_at=clock_timestamp()-interval '1 second'WHERE id=$1",[v.p.reservation_id]);await db.exec('ALTER TABLE uc_admission_evidence_reservations ENABLE TRIGGER uc_admission_history_guard');await as(null,'service_role');expect((await db.query("DELETE FROM storage.objects WHERE bucket_id='admission-case-evidence'AND name=$1 RETURNING id",[v.p.upload_slot.path])).rows).toHaveLength(1);
});
it('rule-source pointer/version/review mismatch, duplicate keys and missing mandatory process questions cannot create rules',async()=>{
 const s=await assigned();for(const override of[{sources:[{...localRef,review_id:unknown}]},{requirements:definitions().slice(0,2)},{requirements:[definitions()[0],definitions()[0],definitions()[2]]},{requirements:definitions().map((x,i)=>i?x:{...x,source_version_ids:[unknown]})}])await denyAction(command(s,'review_local_rules',{sources:[localRef],requirements:definitions(),review_reason:'Must check exact human inputs',...override}),'sources'in override?'P0001':'22023');
 expect((await readCase()).state.rule_set_id).toBeNull();
});
it('history pagination pins ceiling and truthful next revision without duplicating events',async()=>{
 const s=await noFileApplicable(),first=await read({mode:'history',case_id:s.id,ceiling_revision:null,before_revision:null,limit:2}),second=await read({mode:'history',case_id:s.id,ceiling_revision:first.ceiling_revision,before_revision:first.next_before_revision,limit:2});expect(first.has_more).toBe(true);expect(second.items.every((e:any)=>e.case_revision<first.next_before_revision)).toBe(true);expect(new Set([...first.items,...second.items].map((e:any)=>e.id)).size).toBe(4);
});
it('organization deletion requires a separate file plan while case data exists',async()=>{
 const s=await initialize();await db.exec('RESET ROLE');await denied('DELETE FROM organizations WHERE id=$1',[org],'P0001');expect((await row('SELECT count(*)::int n FROM uc_admission_cases WHERE id=$1',[s.id])).n).toBe(1);
});
it('missing enrollment snapshot is an explicit prerequisite and initialize never backfills it',async()=>{
 await db.exec('RESET ROLE;ALTER TABLE group_program_enrollment_snapshots DISABLE TRIGGER uc_program_history_immutable');await db.query('DELETE FROM group_program_enrollment_snapshots WHERE group_id=$1 AND enrollment_id=$2',[group,enrollment]);await db.exec('ALTER TABLE group_program_enrollment_snapshots ENABLE TRIGGER uc_program_history_immutable');await as(owner);const x=await readCase();expect(x.state).toBeNull();expect(x.program_ref).toBeNull();expect(x.prerequisites[0]).toMatchObject({code:'missing_enrollment_snapshot',persisted:false});
 await denyAction({action:'initialize',group_id:group,enrollment_id:enrollment,expected_program_ref:caseRead.program_ref,expected_revision:0},'P0001');await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM uc_admission_cases')).n).toBe(0);
});
it('safe integer ceiling blocks every new prepare/action without incrementing revision',async()=>{
 const s=await ruled();await db.exec('RESET ROLE;ALTER TABLE uc_admission_cases DISABLE TRIGGER uc_admission_history_guard');await db.query('UPDATE uc_admission_cases SET revision=9007199254740991 WHERE id=$1',[s.id]);await db.exec('ALTER TABLE uc_admission_cases ENABLE TRIGGER uc_admission_history_guard');await as(writer);
 await denyAction(command({...s,revision:Number.MAX_SAFE_INTEGER},'assign_responsible',{responsible_id:writer2,reason:'Ceiling protected'}),'P0001');
 await denied('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)',[s.id,Number.MAX_SAFE_INTEGER,JSON.stringify(s.program_ref),req(),JSON.stringify({kind:'upload',requirement_id:s.requirements[0].id,supersedes_id:null,declared_size:42,declared_mime:'application/pdf',declared_sha256:'a'.repeat(64)})],'P0001');
});
it.each([null,-1,9007199254740992])('public prepare rejects invalid revision %s before any reservation',async(revision)=>{
 const s=await ruled();await denied('SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)',[s.id,revision,JSON.stringify(s.program_ref),req(),JSON.stringify({kind:'upload',requirement_id:s.requirements[0].id,supersedes_id:null,declared_size:42,declared_mime:'application/pdf',declared_sha256:'a'.repeat(64)})],'22023');
});
it('case workflow never changes learning/results/identity/programme/issuance or notification rows',async()=>{
 await db.exec('RESET ROLE');const tables=['enrollments','profiles','student_frdo_data','video_identifications','group_program_bindings','group_program_enrollment_snapshots','program_fact_versions','document_number_sequences','document_issuance_log','education_document_records','document_signatures','pep_agreements','org_notifications'];const before:any={};for(const t of tables)before[t]=(await row(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]')::text)hash FROM ${t} t`)).hash;
 const s=await noFileApplicable();await apply(command(s,'record_decision',{rule_set_id:s.rule_set_id,rule_set_digest:s.rule_set_digest,requirements_digest:s.requirements_digest,evidence_version_ids:[],outcome:'admitted',reason:'No technical access action'}));await db.exec('RESET ROLE');
 for(const t of tables)expect((await row(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]')::text)hash FROM ${t} t`)).hash,t).toBe(before[t]);
});
it('strict wire text trims all JavaScript whitespace and association labels use a safe bounded fallback',async()=>{
 const s=await initialize();for(const reason of['\t',' reason','reason\u00a0','\ufeffreason'])await denyAction(command(s,'assign_responsible',{responsible_id:writer,reason}),'22023');
 await db.exec('RESET ROLE');expect((await row("SELECT uc_admission_text(to_jsonb('valid'::text))ok")).ok).toBe(true);await db.query('UPDATE student_groups SET name=$1 WHERE id=$2',['\t\u00a0',group]);await as(owner);const list=await read({mode:'associations',after_id:null,limit:25});expect(admissionAssociationsSchema.parse(list)).toEqual(list);expect(list.items.find((x:any)=>x.scope.group_id===group).group_label).toBe('Группа без названия');
});
it('legitimate113 enrollment cancellation retains new sealed history and denies archive fallback',async()=>{
 const v=await captured(await ruled());await as(owner);await row('SELECT cancel_course_assignment($1,$2)d',[enrollment,org]);
 await denied('SELECT read_student_admission_case($1,$2,$3)',[org,student,JSON.stringify({mode:'history',case_id:v.state.id,ceiling_revision:null,before_revision:null,limit:25})]);await db.exec('RESET ROLE');expect((await row('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).n).toBe(0);expect((await row('SELECT count(*)::int n FROM uc_admission_case_evidence WHERE id=$1',[v.evidence.id])).n).toBe(1);expect((await row('SELECT count(*)::int n FROM storage.objects WHERE id=$1',[v.objectId])).n).toBe(1);
});
it.each([{size:'not-a-number',mimetype:'application/pdf'},{size:'999999999999999999999999',mimetype:'application/pdf'}])('invalid object size is unavailable rather than an unchecked cast: %j',async(metadata)=>{
 const s=await ruled(),{p}=await prepareUpload(s);await db.query('INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,$2,$3,$4,$5)',[req(),p.upload_slot.bucket,p.upload_slot.path,writer,JSON.stringify(metadata)]);
 await denied('SELECT uc_admission_evidence_context($1,$2,$3,$4)',[s.id,p.reservation_id,s.revision,req()],'P0001');
});
