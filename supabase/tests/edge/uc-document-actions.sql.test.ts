// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createUcDocumentScopeFixture} from '../../functions/_shared/uc-document-scope.fixture';
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),owner=id(3),writer=id(4),signer=id(5),issuer=id(6),teacher=id(7),manager=id(8),viewer=id(9),admin=id(10),student=id(11),second=id(12),sales=id(13);
const course=id(20),foreignCourse=id(21),group=id(22),otherGroup=id(23),enr=id(24),foreignEnr=id(25),teacherStaff=id(30),writerStaff=id(31),targetStaff=id(32),signature=id(40),groupDoc=id(41);
const read=(f:string)=>readFileSync(f,'utf8').replace(/^\uFEFF/,'');
const baseline=JSON.parse(read('supabase/tests/fixtures/uc-document-action-baseline-20261018.json'));
let db:PGlite;
const as=async(u:string|null,role='authenticated')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${u||''}',false);SELECT set_config('request.jwt.claim.role','${role}',false);SET ROLE ${role};`);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const denied=async(sql:string,args:any[]=[],match=/denied|permission|scope|access|row-level security/i)=>{await db.exec('SAVEPOINT rejected');await expect(db.query(sql,args)).rejects.toThrow(match);await db.exec('ROLLBACK TO rejected');};
const action=(a:string,g:string|null=null,e:string|null=null,o=org)=>row('SELECT uc_document_action_allowed($1,$2,$3,$4) ok',[o,a,g,e]);
const grant=(s:boolean,i:boolean,old:any=['documents.read','custom.retained'],role='teacher')=>db.query<any>('SELECT set_org_staff_document_grants($1,$2,$3,$4,$5,$6) data',[org,targetStaff,role,JSON.stringify(old),s,i]);
const item={user_id:student,enrollment_id:enr,document_type:'certificate',issue_date:'2026-10-18',full_name:'Synthetic student',birth_date:'1990-01-01',specialty_name:'Synthetic course'};
const issue=(items:any[]=[item])=>db.query<any>('SELECT * FROM issue_education_document_batch($1,$2,$3,$4)',[org,group,course,JSON.stringify(items)]);
async function signed(sender=signer,type='education_document'){
 await as(owner);await db.query('DELETE FROM document_signatures WHERE id=$1',[signature]);
 await as(null,'service_role');await db.exec('RESET ROLE');
 await db.query("INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,document_id,recipient_type,recipient_email,recipient_name,recipient_user_id,status,document_html,signature_token)VALUES($1,$2,$3,$4,'Synthetic',$5,'student','fixture@example.invalid','Recipient',$6,'sent','Current HTML','synthetictoken0123456789abcdef0123')",[signature,org,sender,type,groupDoc,student]);
 await as(null,'service_role');await db.exec('RESET ROLE');
 const hash=(await row("SELECT encode(sha256(convert_to('Current HTML','UTF8')),'hex') hash")).hash;
 const result=(await row('SELECT uc_finalize_signature($1,$2,$3) result',['synthetictoken0123456789abcdef0123',hash,JSON.stringify({agreement_text:'Synthetic accepted agreement',agreement_version:'v1',email:'fixture@example.invalid',full_name:'Recipient'})])).result;
 expect(result.success).toBe(true);return result;
}
beforeAll(async()=>{
 db=await createUcDocumentScopeFixture();
 for(const f of baseline.functions.filter((f:any)=>['next_reg_number','auto_create_education_document','auto_log_document_issuance'].includes(f.name)))await db.exec(f.definition);
 await db.exec(`ALTER TABLE courses ADD COLUMN frdo_program_type text,ADD COLUMN frdo_qualification_name text;
 ALTER TABLE org_staff ADD COLUMN visibility text DEFAULT 'all',ADD COLUMN can_receive_crm_tasks boolean DEFAULT false;
 -- Live metadata verified read-only after foundation: counters are RPC-only.
 ALTER TABLE document_number_sequences ENABLE ROW LEVEL SECURITY;
 CREATE POLICY no_direct_access_seq ON document_number_sequences FOR ALL TO public USING(false) WITH CHECK(false);
 CREATE POLICY account_deletion_no_revoked_access ON document_number_sequences AS RESTRICTIVE FOR ALL TO authenticated USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
 CREATE TRIGGER action_fixture_auto_issue AFTER INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION auto_create_education_document();
 CREATE TRIGGER action_fixture_auto_log AFTER INSERT ON education_document_records FOR EACH ROW EXECUTE FUNCTION auto_log_document_issuance();
 ALTER TABLE admin_staff ENABLE ROW LEVEL SECURITY;GRANT ALL ON admin_staff,user_roles TO authenticated;
 CREATE POLICY action_fixture_admin_staff ON admin_staff FOR ALL TO authenticated USING(has_role('admin',auth.uid())) WITH CHECK(has_role('admin',auth.uid()));
 ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;CREATE POLICY action_fixture_user_roles ON user_roles FOR ALL TO authenticated USING(has_role('admin',auth.uid())) WITH CHECK(has_role('admin',auth.uid()));`);
 const migrate=read('supabase/migrations/20261018105000_uc_document_action_permissions.sql');
 await db.exec('BEGIN');await db.exec(migrate);await db.exec('COMMIT');
},30000);
beforeEach(async()=>{
 await db.exec(`RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false);
 INSERT INTO organizations(id,name)VALUES('${org}','Synthetic A'),('${other}','Synthetic B');
 INSERT INTO profiles(user_id,organization_id,full_name,student_group_id)VALUES('${owner}','${org}','Owner',NULL),('${writer}','${org}','Writer',NULL),('${signer}','${org}','Signer',NULL),('${issuer}','${org}','Issuer',NULL),('${teacher}','${org}','Teacher',NULL),('${manager}','${org}','Manager',NULL),('${student}','${org}','Student','${group}'),('${second}','${other}','Other','${otherGroup}'),('${sales}','${org}','Sales',NULL);
 INSERT INTO user_roles VALUES('${owner}','organization'),('${viewer}','admin'),('${admin}','admin'),('${student}','student');
 INSERT INTO admin_staff(user_id,role)VALUES('${viewer}','viewer');
 INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES
 ('${writerStaff}','${writer}','${org}','custom','["documents.read","documents.write"]'),
 ('${id(33)}','${signer}','${org}','custom','["documents.read","documents.sign"]'),
 ('${id(34)}','${issuer}','${org}','custom','["documents.read","documents.issue"]'),
 ('${teacherStaff}','${teacher}','${org}','teacher','["documents.sign","documents.issue","documents.write"]'),
 ('${id(35)}','${manager}','${org}','custom','["staff.write"]'),
 ('${targetStaff}','${second}','${org}','teacher','["documents.read","custom.retained"]'),
 ('${id(36)}','${sales}','${org}','custom','["sales.write"]');
 INSERT INTO courses(id,organization_id,title)VALUES('${course}','${org}','Course'),('${foreignCourse}','${other}','Other');
 INSERT INTO student_groups(id,organization_id,course_id,name)VALUES('${group}','${org}','${course}','Assigned'),('${otherGroup}','${other}','${foreignCourse}','Foreign');
 INSERT INTO enrollments(id,user_id,course_id,status)VALUES('${enr}','${student}','${course}','active'),('${foreignEnr}','${second}','${foreignCourse}','active');
 `);
 await as(owner);
 await db.exec('RESET ROLE');
 await db.query("INSERT INTO group_documents(id,organization_id,group_id,doc_type,name,html)VALUES($1,$2,$3,'student_list','Scoped','HTML')",[groupDoc,org,group]);
 await db.query("INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,document_id,recipient_type,recipient_email,recipient_name,status,document_html,document_hash)VALUES($1,$2,$3,'contract','Synthetic',$4,'student','fixture@example.invalid','Recipient','draft','HTML','hash')",[signature,org,owner,groupDoc]);
 await as(owner);
});
afterEach(async()=>db.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());

it('adds only owner/admin defaults and leaves stored additive grants and legacy evidence unchanged',async()=>{
 expect((await row("SELECT org_role_default_permissions('admin') p")).p).toEqual(expect.arrayContaining(['documents.sign','documents.issue']));
 expect((await row("SELECT org_role_default_permissions('teacher') p")).p).not.toContain('documents.sign');
 expect((await row('SELECT sections_access FROM org_staff WHERE id=$1',[writerStaff])).sections_access).toEqual(['documents.read','documents.write']);
 await db.exec('RESET ROLE');expect((await row("SELECT document_html,document_hash FROM document_signatures WHERE id='00000000-0000-4000-8000-000000000010'"))).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
});
it('write, sign and issue are independent; unknown actions and foreign scope deny even owner',async()=>{
 for(const [u,allowed] of [[writer,'write'],[signer,'sign'],[issuer,'issue']] as const){await as(u);for(const a of ['write','sign','issue'])expect(await action(a)).toEqual({ok:a===allowed});}
 await as(owner);expect(await action('issue',otherGroup)).toEqual({ok:false});expect(await action('documents.issue')).toEqual({ok:false});
});
it('teacher needs assignment and exact group plus enrollment, not null scope',async()=>{
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);await as(teacher);
 expect(await action('issue',group,enr)).toEqual({ok:true});expect(await action('issue')).toEqual({ok:false});expect(await action('issue',group,foreignEnr)).toEqual({ok:false});
});
it('keeps contract draft numbering for write-only staff and fences final orders/education namespaces',async()=>{
 await as(writer);expect((await row("SELECT get_next_document_number($1,'contract',2026) n",[org])).n).toBe(1);
 for(const t of ['group_order','edu_doc','edu_reg'])await denied('SELECT get_next_document_number($1,$2,2026)',[org,t]);
 await as(issuer);expect((await row("SELECT reserve_group_document_number($1,$2,'group_order',2026) n",[org,group])).n).toBe(1);
 await denied("SELECT get_next_document_number($1,'contract',2026)",[org]);
});
it('education counter requires issue and exact tenant; assigned teacher uses scoped RPC',async()=>{
 await as(writer);await denied("SELECT next_reg_number($1,'certificate',2026)",[org]);
 await as(issuer);expect((await row("SELECT next_reg_number($1,'certificate',2026) n",[org])).n).toBe(1);await denied("SELECT next_reg_number($1,'certificate',2026)",[other]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);await as(teacher);
 await denied("SELECT next_reg_number($1,'certificate',2026)",[org]);expect((await row("SELECT reserve_education_registration_number($1,$2,'certificate',2026) n",[org,group])).n).toBe(2);
});
it('grant CAS preserves unrelated keys and reload is available to staff.write without staff.read',async()=>{
 const v=(await grant(true,false)).rows[0].data;expect(v.sections_access).toEqual(['documents.read','custom.retained','documents.sign']);
 await denied('SELECT set_org_staff_document_grants($1,$2,$3,$4,false,false)',[org,targetStaff,'teacher',JSON.stringify(['documents.read','custom.retained'])],/reload/);
 await as(manager);expect((await row('SELECT get_org_staff_document_grants($1,$2) d',[org,targetStaff])).d.sections_access).toEqual(v.sections_access);
});
it('staff.write-only cannot add actions by RPC, direct JSON or role promotion, but may remove a grant',async()=>{
 await grant(true,true);await as(manager);
 await denied('SELECT set_org_staff_document_grants($1,$2,$3,$4,true,true)',[org,writerStaff,'custom',JSON.stringify(['documents.read','documents.write'])]);
 await denied("UPDATE org_staff SET role='admin' WHERE id=$1",[writerStaff]);
 await denied("UPDATE org_staff SET sections_access='[\"documents.issue\"]' WHERE id=$1",[writerStaff]);
 expect((await grant(false,false,['documents.read','custom.retained','documents.sign','documents.issue'])).rows[0].data.sections_access).toEqual(['documents.read','custom.retained']);
 expect(await row("SELECT validate_org_staff_document_assignment($1,'admin','[]') ok",[org])).toEqual({ok:false});
});
it('platform viewer can read but cannot write, sign, issue, reserve numbers or upload private files',async()=>{
 await as(viewer);expect(await action('read')).toEqual({ok:true});for(const a of ['write','sign','issue'])expect(await action(a)).toEqual({ok:false});
 await denied("SELECT get_next_document_number($1,'contract',2026)",[org]);
 await denied("INSERT INTO org_documents(organization_id,name,type)VALUES($1,'Forbidden','license')",[org]);
 await denied('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['org-documents',`${org}/forged.pdf`]);
});
it('viewer cannot self-promote, remove its limiting staff row or mint an unrestricted global admin',async()=>{
 await as(viewer);await denied("UPDATE admin_staff SET role='admin' WHERE user_id=$1",[viewer]);
 await denied('DELETE FROM admin_staff WHERE user_id=$1',[viewer]);await denied("INSERT INTO user_roles VALUES($1,'admin')",[writer]);
 await denied('DELETE FROM user_roles WHERE user_id=$1',[viewer]);
});
it('legacy platform admin and active platform administrator retain delegated management; expired admin denies',async()=>{
 await as(admin);expect(await action('issue')).toEqual({ok:true});await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'admin')",[admin]);expect(await action('sign')).toEqual({ok:true});
 await db.query("UPDATE admin_staff SET expires_at=now()-interval '1 second' WHERE user_id=$1",[admin]);expect(await action('write')).toEqual({ok:false});
});
it('revoked and expired organization staff lose action grants immediately',async()=>{
 await db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.role','service_role',false);SELECT set_config('request.jwt.claim.sub','',false);UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id='${issuer}';INSERT INTO account_deletion_revocations VALUES('${writer}');`);
 for(const u of [writer,issuer]){await as(u);expect(await action(u===writer?'write':'issue')).toEqual({ok:false});}
});
it('issue-only can issue once and re-export idempotently; write-only cannot issue through SECURITY DEFINER',async()=>{
 await as(writer);await db.exec('SAVEPOINT issue');await expect(issue()).rejects.toThrow(/not authorized/);await db.exec('ROLLBACK TO issue');
 await as(issuer);const first=await issue();expect(first.rows).toHaveLength(1);expect(first.rows[0].document_number).toBe('2026/000001');
 expect((await issue()).rows[0].id).toBe(first.rows[0].id);
 expect(await row('SELECT count(*)::int n FROM document_issuance_log WHERE organization_id=$1',[org])).toEqual({n:1});
 await db.exec('RESET ROLE');
 expect((await db.query('SELECT doc_type,last_number FROM document_number_sequences WHERE organization_id=$1 ORDER BY doc_type',[org])).rows).toEqual([{doc_type:'edu_doc',last_number:1},{doc_type:'edu_reg',last_number:1}]);
});
it('invalid second issuance item rolls back the first item, log and both counters',async()=>{
 await as(issuer);await db.exec('SAVEPOINT partial');await expect(issue([item,{...item,enrollment_id:foreignEnr,user_id:second}])).rejects.toThrow(/scope|member|enrollment/);await db.exec('ROLLBACK TO partial');
 expect(await row('SELECT count(*)::int n FROM education_document_records WHERE organization_id=$1',[org])).toEqual({n:0});
 await db.exec('RESET ROLE');
 expect(await row('SELECT count(*)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).toEqual({n:0});
});
it('assigned teacher issues within group and cannot forge persisted user/course provenance even owner',async()=>{
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);await as(teacher);expect((await issue()).rows).toHaveLength(1);
 await as(owner);await denied("INSERT INTO education_document_records(organization_id,user_id,course_id,group_id,enrollment_id,document_type,full_name,birth_date,issue_date,specialty_name,document_number,reg_number)VALUES($1,$2,$3,$4,$5,'certificate','Forgery','1990-01-01','2026-10-18','Course','2026/999','FAKE')",[org,second,course,group,enr]);
});
it('learner completion survives the legacy automatic issuer without issuing or consuming counters',async()=>{
 await db.exec(`RESET ROLE;UPDATE courses SET frdo_program_type='qualification_upgrade' WHERE id='${course}';INSERT INTO student_frdo_data(user_id,organization_id,birth_date)VALUES('${student}','${org}','1990-01-01');`);
 // Actual learner enrollment completion is performed by a SECURITY DEFINER path;
 // retain its identity while bypassing only the fixture's unrelated source RLS.
 await as(student);await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET status='completed',progress=100 WHERE id=$1",[enr]);
 expect(await row('SELECT status FROM enrollments WHERE id=$1',[enr])).toEqual({status:'completed'});
 expect(await row('SELECT count(*)::int n FROM education_document_records WHERE organization_id=$1',[org])).toEqual({n:0});
 expect(await row('SELECT count(*)::int n FROM document_number_sequences WHERE organization_id=$1',[org])).toEqual({n:0});
});
it('recipient token finalization survives without staff actions; sign-only original sender can countersign idempotently',async()=>{
 await signed();await as(writer);await denied('SELECT sender_countersign($1)',[signature]);
 await as(signer);expect(await action('write')).toEqual({ok:false});await db.exec(`SELECT set_config('request.headers','{"x-forwarded-for":"192.0.2.5, 192.0.2.6","user-agent":"Synthetic test"}',true)`);
 await db.query('SELECT sender_countersign($1,$2,$3)',[signature,'forged-ip','forged-agent']);const first=await row('SELECT sender_signed_at,sender_signed_ip,sender_signed_user_agent FROM document_signatures WHERE id=$1',[signature]);
 expect(first.sender_signed_ip).toBe('192.0.2.5');expect(first.sender_signed_user_agent).toBe('Synthetic test');await db.query('SELECT sender_countersign($1)',[signature]);expect(await row('SELECT sender_signed_at,sender_signed_ip,sender_signed_user_agent FROM document_signatures WHERE id=$1',[signature])).toEqual(first);
 expect((await db.query("UPDATE document_signatures SET document_html='Fake' WHERE id=$1 RETURNING id",[signature])).rows).toEqual([]);
 expect((await row('SELECT document_html FROM document_signatures WHERE id=$1',[signature])).document_html).toBe('Current HTML');
});
it('commercial sales exception is original-sender only and does not extend to an educational signature',async()=>{
 await signed(sales,'contract');await as(sales);await db.query('SELECT sender_countersign($1)',[signature]);expect((await row('SELECT sender_signed_at FROM document_signatures WHERE id=$1',[signature])).sender_signed_at).toBeTruthy();
 await as(owner);await db.exec('RESET ROLE');await db.query('SELECT set_config($1,$2,false)',['request.jwt.claim.sub',sales]);expect((await row('SELECT uc_signature_action_allowed($1,$2) ok',[signature,'sign'])).ok).toBe(true);
});
it('read-only recipient teacher cannot use personal invite as staff write or sign scope',async()=>{
 await as(owner);await db.query('UPDATE document_signatures SET recipient_user_id=$1,document_id=NULL WHERE id=$2',[teacher,signature]);await as(teacher);
 expect(await row('SELECT uc_signature_actor_allowed($1,false,true) ok',[signature])).toEqual({ok:true});
 expect(await row('SELECT uc_signature_action_allowed($1,$2) ok',[signature,'write'])).toEqual({ok:false});expect(await row('SELECT uc_signature_action_allowed($1,$2) ok',[signature,'sign'])).toEqual({ok:false});
});
it('read-only platform recipient retains only own pending scan and own learner file uploads',async()=>{
 await as(owner);await db.query("UPDATE document_signatures SET recipient_user_id=$1,status='sent' WHERE id=$2",[viewer,signature]);await as(viewer);
 const scan=`${org}/signed-scans/${signature}-synthetic.pdf`;
 await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['external-contracts',scan]);
 await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['student-documents',`${viewer}/synthetic.pdf`]);
 await denied('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['external-contracts',`${org}/signed-scans/${id(88)}-forged.pdf`]);
 await denied('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['student-documents',`${student}/forged.pdf`]);
 expect((await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2 RETURNING id',['{}',scan])).rows).toEqual([]);
});
it('staff commit rechecks action grants and preserves existing unrelated sections, while staff.write may assign a plain teacher',async()=>{
 const commit=(role:string,u=second)=>db.query('SELECT commit_org_staff_document_assignment($1,$2,$3,$4,$5,$6) ok',[org,u,role,'Synthetic updated display','course_only',true]);
 await as(manager);await denied('SELECT commit_org_staff_document_assignment($1,$2,$3,$4,$5,$6)',[org,second,'admin','Denied','all',false]);
 expect((await commit('teacher')).rows).toEqual([{ok:true}]);
 await as(owner);expect((await row('SELECT sections_access,display_name,visibility FROM org_staff WHERE id=$1',[targetStaff]))).toEqual({sections_access:['documents.read','custom.retained'],display_name:'Synthetic updated display',visibility:'course_only'});
 expect((await commit('admin')).rows).toEqual([{ok:true}]);
});
it('staff commit fails after actor revocation even when its earlier validation was allowed',async()=>{
 expect(await row("SELECT validate_org_staff_document_assignment($1,'admin','[]') ok",[org])).toEqual({ok:true});
 await db.exec(`RESET ROLE;INSERT INTO account_deletion_revocations VALUES('${owner}');`);await as(owner);
 await denied("SELECT commit_org_staff_document_assignment($1,$2,'admin','Denied','all',false)",[org,second]);
 await db.exec('RESET ROLE');expect((await row('SELECT role FROM org_staff WHERE id=$1',[targetStaff])).role).toBe('teacher');
});
it('assigned multi-organization teacher can save only contracts with exact group/student/company provenance',async()=>{
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
 await db.exec(`RESET ROLE;UPDATE profiles SET organization_id='${other}' WHERE user_id='${teacher}';`);await as(teacher);
 const record=id(90);await db.query('INSERT INTO org_contracts(id,organization_id,student_group_id,student_user_id,name)VALUES($1,$2,$3,$4,$5)',[record,org,group,student,'Synthetic contract']);
 expect((await db.query("UPDATE org_contracts SET name='Updated' WHERE id=$1 RETURNING id",[record])).rows).toEqual([{id:record}]);
 await denied('INSERT INTO org_contracts(organization_id,student_group_id,student_user_id,name)VALUES($1,$2,$3,$4)',[org,group,second,'Forged']);
 await as(viewer);expect((await db.query("UPDATE org_contracts SET name='Forbidden' WHERE id=$1 RETURNING id",[record])).rows).toEqual([]);
});
it('plain writer can create a group draft but final order issuance requires its own action',async()=>{
 const batch=(status:string)=>db.query('SELECT * FROM create_group_document_batch($1,$2,$3)',[org,group,JSON.stringify([{doc_type:'enrollment_order',name:'Synthetic order',doc_status:status,html:'HTML'}])]);
 await as(writer);expect((await batch('draft')).rows).toHaveLength(1);await db.exec('SAVEPOINT final');await expect(batch('final')).rejects.toThrow(/scope|denied/);await db.exec('ROLLBACK TO final');
});
it('teacher can create invitation for exact assigned source but cannot create an unbound or foreign invitation',async()=>{
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);await as(teacher);
 const sql="INSERT INTO document_signatures(organization_id,sender_user_id,document_type,document_title,document_id,recipient_type,recipient_email,recipient_name,status)VALUES($1,$2,'education_document','Scoped',$3,'student','fixture@example.invalid','Recipient','draft')";
 await db.query(sql,[org,teacher,groupDoc]);await denied(sql,[org,teacher,null]);
 await denied(sql,[other,teacher,groupDoc]);
});
it('pending invitation UPDATE validates new provenance before moving outside the assigned scope',async()=>{
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);await as(teacher);
 await denied('UPDATE document_signatures SET document_id=NULL WHERE id=$1',[signature]);
 await denied('UPDATE document_signatures SET document_id=$1 WHERE id=$2',[id(999),signature]);
 expect((await row('SELECT document_id FROM document_signatures WHERE id=$1',[signature])).document_id).toBe(groupDoc);
});
it('nullable grant CAS distinguishes SQL null from an empty array and preserves unrelated grants',async()=>{
 await db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false);UPDATE org_staff SET sections_access=NULL WHERE id='${targetStaff}';`);await as(owner);
 await denied('SELECT set_org_staff_document_grants($1,$2,$3,$4,true,false)',[org,targetStaff,'teacher','[]'],/reload/);
 expect((await db.query<any>('SELECT set_org_staff_document_grants($1,$2,$3,$4,true,false) d',[org,targetStaff,'teacher',null])).rows[0].d.sections_access).toEqual(['documents.sign']);
});
it('platform sales manager keeps only commercial sender staging/countersign and no educational sign action',async()=>{
 await db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false);INSERT INTO user_roles VALUES('${sales}','admin');INSERT INTO admin_staff(user_id,role)VALUES('${sales}','sales_manager');`);
 await signed(sales,'contract');await as(sales);expect(await action('sign')).toEqual({ok:false});await db.query('SELECT sender_countersign($1)',[signature]);
 await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['external-contracts',`${org}/${id(91)}.pdf`]);
 await denied('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['org-documents',`${org}/forged.pdf`]);
});
