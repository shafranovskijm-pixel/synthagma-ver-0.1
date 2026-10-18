// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect,describe} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {createUcDocumentScopeFixture,scopeMigration} from './uc-document-scope.fixture';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),owner=id(3),teacher=id(4),manager=id(5),admin=id(6),viewer=id(7),student=id(8),second=id(9);
const staff=id(10),managerStaff=id(11),course=id(12),secondCourse=id(13),foreignCourse=id(14),group=id(15),secondGroup=id(16),foreignGroup=id(17);
const enr=id(18),secondEnr=id(19),otherCourseEnr=id(20),lesson=id(21),otherLesson=id(22),sig=id(23),groupDoc=id(24);
let db:PGlite;
const as=async(uid:string|null,role='authenticated')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${uid||''}',false);SET ROLE ${role};`);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const assign=(groups=[group],revision=0)=>db.query<any>('SELECT set_org_staff_document_groups($1,$2,$3,$4) data',[org,staff,groups,revision]);
const scope=(g:string|null,e:string|null,o=org)=>row('SELECT uc_document_scope_allowed($1,$2,$3) ok',[o,g,e]);
beforeAll(async()=>{db=await createUcDocumentScopeFixture(false);
 const before=(await db.query(`SELECT name FROM org_documents`)).rows;
 await db.exec('ALTER VIEW student_group_profiles_effective SET(security_invoker=false)');
 await expect(db.exec(scopeMigration)).rejects.toThrow(/security-invoker membership views/);await db.exec('ROLLBACK');
 await db.exec('ALTER VIEW student_group_profiles_effective SET(security_invoker=true)');
 await expect(db.exec(scopeMigration.replace('COMMIT;',()=>"DO $$BEGIN RAISE EXCEPTION 'late fixture failure';END$$;COMMIT;"))).rejects.toThrow(/late fixture failure/);
 await db.exec('ROLLBACK');expect(await row("SELECT to_regclass('org_staff_document_groups') IS NULL absent")).toEqual({absent:true});
 expect((await db.query('SELECT name FROM org_documents')).rows).toEqual(before);
 await db.exec(scopeMigration);
 expect(await row('SELECT count(*)::int n FROM org_staff_document_groups')).toEqual({n:0});
},30000);
beforeEach(async()=>{
 await db.exec(`RESET ROLE;BEGIN;
 INSERT INTO organizations(id,name)VALUES('${org}','Synthetic A'),('${other}','Synthetic B');
 INSERT INTO profiles(user_id,organization_id,full_name,student_group_id)VALUES('${owner}','${org}','Owner',NULL),('${teacher}','${org}','Teacher',NULL),('${manager}','${other}','Manager',NULL),('${student}','${org}','One','${group}'),('${second}','${org}','Two','${secondGroup}');
 INSERT INTO user_roles VALUES('${owner}','organization'),('${admin}','admin'),('${viewer}','admin'),('${student}','student'),('${second}','student');
 INSERT INTO admin_staff(user_id,role)VALUES('${viewer}','viewer');
 INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES('${staff}','${teacher}','${org}','teacher','[]'),('${managerStaff}','${manager}','${org}','custom','["staff.read","staff.write"]');
 INSERT INTO courses(id,organization_id,title)VALUES('${course}','${org}','Course A'),('${secondCourse}','${org}','Course B'),('${foreignCourse}','${other}','Foreign');
 INSERT INTO student_groups(id,organization_id,course_id,name)VALUES('${group}','${org}','${course}','Assigned'),('${secondGroup}','${org}','${course}','Other'),('${foreignGroup}','${other}','${foreignCourse}','Foreign');
 INSERT INTO enrollments(id,user_id,course_id,status,progress)VALUES('${enr}','${student}','${course}','completed',100),('${secondEnr}','${second}','${course}','active',0),('${otherCourseEnr}','${student}','${secondCourse}','active',0);
 INSERT INTO lessons VALUES('${lesson}','${course}'),('${otherLesson}','${secondCourse}');
 INSERT INTO test_attempts VALUES('${id(30)}','${student}','${lesson}',5),('${id(31)}','${second}','${lesson}',0),('${id(32)}','${student}','${otherLesson}',0);
 INSERT INTO lesson_progress VALUES('${id(30)}','${student}','${lesson}',true),('${id(31)}','${second}','${lesson}',false),('${id(32)}','${student}','${otherLesson}',false);
 INSERT INTO enrollment_history VALUES('${id(30)}','${enr}','${student}','${course}'),('${id(31)}','${secondEnr}','${second}','${course}');
 INSERT INTO org_documents(organization_id,name,type)VALUES('${org}','Private org document','license');
 INSERT INTO group_documents(id,organization_id,group_id,doc_type,name,html)VALUES('${groupDoc}','${org}','${group}','student_list','Assigned file','Private group HTML'),('${id(25)}','${org}','${secondGroup}','student_list','Unassigned file','Other HTML');
 INSERT INTO student_documents(enrollment_id,type,name)VALUES('${enr}','certificate','Assigned'),('${secondEnr}','certificate','Other');
 INSERT INTO student_identity_documents(user_id,organization_id,type,name,file_path)VALUES('${student}','${org}','passport','One','${student}/passport.pdf'),('${second}','${org}','passport','Two','${second}/passport.pdf');
 INSERT INTO document_issuance_log(organization_id,enrollment_id,user_id,user_name,document_type,document_name)VALUES('${org}','${enr}','${student}','One','certificate','Assigned'),('${org}','${secondEnr}','${second}','Two','certificate','Other');
 INSERT INTO journal_instances VALUES('${id(35)}','${org}','${course}','Scoped journal');
 INSERT INTO journal_entries VALUES('${id(36)}','${id(35)}','${student}','Pass'),('${id(37)}','${id(35)}','${second}','Fail');
 INSERT INTO storage.objects(bucket_id,name)VALUES('student-documents','${student}/passport.pdf'),('student-documents','${second}/passport.pdf'),('student-documents','students/${enr}/issued.pdf'),('student-documents','students/${otherCourseEnr}/issued.pdf'),('billing-documents','organizations/${org}/group-documents/${group}/draft.pdf'),('billing-documents','organizations/${org}/group-documents/${secondGroup}/draft.pdf'),('org-documents','${org}/private.pdf');
 `);
 await as(owner);
});
afterEach(async()=>{await db.exec('RESET ROLE;ROLLBACK');});
afterAll(async()=>db?.close());

describe('authoritative staff assignments',()=>{
 it('starts empty, returns real choices to staff manager without students.read and never infers assignments',async()=>{
  await as(manager);const data=(await row('SELECT get_org_staff_document_scope($1,$2) data',[org,staff])).data;
  expect(data).toMatchObject({revision:0,group_ids:[],scope:'assigned_groups'});expect(data.available_groups).toHaveLength(2);
  await as(teacher);expect((await row('SELECT get_org_staff_document_scope($1,$2) data',[org,staff])).data.available_groups).toEqual([]);
  expect(await scope(null,null)).toEqual({ok:false});expect(await scope(group,enr)).toEqual({ok:false});
 });
 it('atomically saves a deduplicated set, audits once, no-ops current replay and rejects stale CAS',async()=>{
  const first=(await assign([group,group])).rows[0].data;expect(first.revision).toBe(1);expect(first.group_ids).toEqual([group]);
  expect((await assign([group],1)).rows[0].data.revision).toBe(1);
  await db.exec('SAVEPOINT cas');await expect(assign([],0)).rejects.toThrow(/revision_conflict/);await db.exec('ROLLBACK TO cas');
  await db.exec('RESET ROLE');expect(await row('SELECT count(*)::int n FROM org_staff_document_scope_events')).toEqual({n:1});
  await as(owner);expect((await assign([],1)).rows[0].data.revision).toBe(2);
  await as(teacher);expect(await scope(group,enr)).toEqual({ok:false});
 });
 it.each([teacher,student,viewer])('denies assignment writes from %s without changing rows',async user=>{
  await as(user);await db.exec('SAVEPOINT denied');await expect(assign()).rejects.toThrow(/access_denied/);await db.exec('ROLLBACK TO denied');
  await db.exec('RESET ROLE');expect(await row('SELECT count(*)::int n FROM org_staff_document_groups')).toEqual({n:0});
 });
 it('rejects foreign/null group input and cannot directly DML assignment/audit tables',async()=>{
  for(const groups of [[foreignGroup],[null]]){await db.exec('SAVEPOINT bad');await expect(assign(groups as any)).rejects.toThrow(/group_not_in_organization|invalid_staff_scope/);await db.exec('ROLLBACK TO bad');}
  for(const table of ['org_staff_document_groups','org_staff_document_scopes','org_staff_document_scope_events']){await db.exec('SAVEPOINT bad');await expect(db.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/);await db.exec('ROLLBACK TO bad');}
 });
 it('revoked manager and expired platform admin cannot save',async()=>{
  await db.exec(`RESET ROLE;INSERT INTO account_deletion_revocations VALUES('${manager}');INSERT INTO admin_staff(user_id,role,expires_at)VALUES('${admin}','admin',now()-interval '1 day');`);
  for(const u of [manager,admin]){await as(u);await db.exec('SAVEPOINT bad');await expect(assign()).rejects.toThrow(/access_denied/);await db.exec('ROLLBACK TO bad');}
 });
});

describe('assigned document, journal and storage boundaries',()=>{
 it('validates both scope arguments with AND, even for owner/admin',async()=>{
  await assign();
  for(const user of [owner,admin,teacher]){await as(user);expect(await scope(group,enr)).toEqual({ok:true});expect(await scope(secondGroup,enr)).toEqual({ok:false});expect(await scope(group,otherCourseEnr)).toEqual({ok:false});expect(await scope(foreignGroup,null)).toEqual({ok:false});}
 });
 it('zero assignments hides all other learner/course rows, org-wide docs and known private files',async()=>{
  await as(teacher);
  for(const t of ['group_documents','org_documents','student_documents','student_identity_documents','document_issuance_log','test_attempts','lesson_progress','enrollments','enrollment_history','journal_entries'])expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(0);
  expect((await db.query("SELECT * FROM storage.objects WHERE name LIKE $1 OR name LIKE $2",[`%${student}%`,`%${org}%`])).rows).toHaveLength(0);
 });
 it('exposes only the assigned group and exact course, with same pupil in other course denied',async()=>{
  await assign();await as(teacher);
  for(const t of ['group_documents','student_documents','student_identity_documents','document_issuance_log','test_attempts','lesson_progress','enrollments','enrollment_history','journal_entries'])expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(1);
  expect((await db.query('SELECT user_id FROM profiles WHERE user_id<>$1',[teacher])).rows).toEqual([{user_id:student}]);
  expect((await db.query('SELECT * FROM org_documents')).rows).toHaveLength(0);
  expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='student-documents' ORDER BY name")).rows).toEqual([{name:`${student}/passport.pdf`},{name:`students/${enr}/issued.pdf`}]);
 });
 it('expiry/revocation immediately removes previously assigned data',async()=>{
  await assign();await db.exec(`RESET ROLE;UPDATE org_staff SET expires_at=now()-interval '1 second' WHERE id='${staff}';`);await as(teacher);
  expect(await scope(group,enr)).toEqual({ok:false});expect((await db.query('SELECT * FROM test_attempts')).rows).toHaveLength(0);
  await db.exec(`RESET ROLE;UPDATE org_staff SET expires_at=NULL WHERE id='${staff}';INSERT INTO account_deletion_revocations VALUES('${teacher}');`);await as(teacher);
  expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0);
 });
 it('keeps learner self reads without inventing teacher assignments',async()=>{
  await as(student);expect((await db.query('SELECT * FROM student_documents')).rows).toHaveLength(1);
  expect(await row('SELECT uc_document_storage_scope($1,$2) ok',['student-documents',`${student}/passport.pdf`])).toEqual({ok:true});
 });
 it('extra permissive storage policy cannot leak org-wide or unassigned blobs',async()=>{
  await assign();await db.exec('RESET ROLE;CREATE POLICY fixture_storage_broad ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true)');await as(teacher);
  expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='billing-documents'")).rows).toEqual([{name:`organizations/${org}/group-documents/${group}/draft.pdf`}]);
  expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='org-documents'")).rows).toHaveLength(0);
  await db.exec('SAVEPOINT storage');await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',`organizations/${org}/group-documents/${secondGroup}/forged.pdf`])).rejects.toThrow(/row-level security/);await db.exec('ROLLBACK TO storage');
 });
 it('organization-wide SECURITY DEFINER aggregate/recycle endpoints fail closed for teacher',async()=>{
  await assign();await as(teacher);
  for(const name of ['get_documents_kpi','list_recycle_bin','get_frdo_export_readiness']){await db.exec('SAVEPOINT rpc');await expect(db.query(`SELECT * FROM ${name}($1)`,[org])).rejects.toThrow(/organization_wide_document_scope_required/);await db.exec('ROLLBACK TO rpc');}
 });
 it('actual student-page RPC filters records, nested enrollments and totals before pagination',async()=>{
  await assign();await as(teacher);
  const rows=(await db.query<any>('SELECT * FROM get_organization_students_page($1)',[org])).rows;
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({user_id:student,total_count:1,active_count:1});expect(rows[0].enrollments.map((x:any)=>x.id)).toEqual([enr]);
  const courseRows=(await db.query<any>('SELECT * FROM get_course_students_page($1)',[course])).rows;
  expect(courseRows).toHaveLength(1);expect(courseRows[0]).toMatchObject({user_id:student,total_count:1,completed_count:1,active_count:0});
  expect((await db.query<any>('SELECT * FROM get_organization_student_group_counts($1)',[org])).rows).toEqual([{group_id:group,total_count:1,active_count:1,archived_count:0}]);
 });
 it('honors additional effective memberships without treating student membership as teacher assignment',async()=>{
  await db.exec(`RESET ROLE;UPDATE profiles SET student_group_id='${secondGroup}' WHERE user_id='${student}';INSERT INTO student_group_memberships VALUES('${org}','${group}','${student}');`);
  await as(teacher);expect(await scope(group,enr)).toEqual({ok:false});
  await as(owner);await assign();await as(teacher);expect(await scope(group,enr)).toEqual({ok:true});
  const rows=(await db.query<any>('SELECT * FROM get_organization_students_page($1)',[org])).rows;
  expect(rows).toHaveLength(1);expect(rows[0].student_group_id).toBeNull();
 });
 it('multi-org teacher sees assigned groups/effective memberships despite a different profile organization',async()=>{
  await assign();await db.exec(`RESET ROLE;UPDATE profiles SET organization_id='${other}' WHERE user_id='${teacher}';`);await as(teacher);
  expect((await db.query('SELECT id FROM student_groups')).rows).toEqual([{id:group}]);
  expect((await db.query('SELECT * FROM student_group_memberships_effective')).rows).toEqual([{organization_id:org,group_id:group,user_id:student}]);
  expect((await db.query('SELECT user_id,group_id FROM student_group_profiles_effective')).rows).toEqual([{user_id:student,group_id:group}]);
  expect((await db.query('SELECT * FROM enrollment_history')).rows).toHaveLength(1);
 });
 it('rejects mismatched persisted user/course provenance and a corrupt foreign-course group',async()=>{
  await assign();await as(teacher);
  const check=(u:string,c:string,g:string|null=group)=>row('SELECT uc_document_record_scope($1,$2,$3,$4,$5) ok',[org,g,enr,u,c]);
  expect(await check(student,course)).toEqual({ok:true});expect(await check(second,course)).toEqual({ok:false});expect(await check(student,secondCourse)).toEqual({ok:false});
  await db.exec(`RESET ROLE;UPDATE student_groups SET course_id='${foreignCourse}' WHERE id='${group}';`);
  await as(owner);expect(await scope(group,null)).toEqual({ok:false});
 });
 it('preserves own profile, own attempts and own documents for teacher plus learner dual role',async()=>{
  await db.exec(`RESET ROLE;INSERT INTO user_roles VALUES('${teacher}','student');INSERT INTO enrollments(id,user_id,course_id,status)VALUES('${id(55)}','${teacher}','${secondCourse}','active');INSERT INTO test_attempts VALUES('${id(56)}','${teacher}','${otherLesson}',3);INSERT INTO student_documents(enrollment_id,type,name)VALUES('${id(55)}','certificate','Personal');`);
  await as(teacher);expect((await db.query('SELECT * FROM profiles WHERE user_id=$1',[teacher])).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM test_attempts')).rows).toHaveLength(1);expect((await db.query('SELECT * FROM student_documents')).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM group_documents')).rows).toHaveLength(0);
 });
 it('keeps own student membership visible through both security-invoker views',async()=>{
  await as(student);expect((await db.query('SELECT * FROM student_group_memberships_effective')).rows).toEqual([{organization_id:org,group_id:group,user_id:student}]);
  expect((await db.query('SELECT user_id,group_id FROM student_group_profiles_effective')).rows).toEqual([{user_id:student,group_id:group}]);
 });
 it('signature read requires exact assigned provenance, while personal recipient reads survive',async()=>{
  await assign();
  for(const [sid,did,recipient] of [[sig,groupDoc,null],[id(40),id(25),null],[id(41),null,teacher]])await db.query(`INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,document_id,recipient_type,recipient_email,recipient_name,recipient_user_id,status)VALUES($1,$2,$3,'contract','Synthetic',$4,'student','fixture@example.invalid','Synthetic',$5,'draft')`,[sid,org,owner,did,recipient]);
  await db.query("INSERT INTO signature_revisions(signature_id,version,created_by,file_url)VALUES($1,1,$2,$3)",[sig,owner,`${org}/contracts/assigned.pdf`]);
  await db.exec(`RESET ROLE;INSERT INTO storage.objects(bucket_id,name)VALUES('external-contracts','${org}/contracts/assigned.pdf'),('external-contracts','${org}/contracts/unbound.pdf');`);
  await as(teacher);expect((await db.query('SELECT id FROM document_signatures WHERE organization_id=$1 ORDER BY id',[org])).rows).toEqual([{id:sig},{id:id(41)}]);
  expect(await row('SELECT uc_document_signature_scope($1) ok',[id(41)])).toEqual({ok:false});
  expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='external-contracts'")).rows).toEqual([{name:`${org}/contracts/assigned.pdf`}]);
  expect((await db.query('SELECT * FROM signature_revisions')).rows).toHaveLength(1);
 });
 it('applies scope and platform viewer denial to the actual journal mark RPC; keeps its revision CAS',async()=>{
  await assign();await db.exec(`RESET ROLE;UPDATE student_groups SET training_dates=ARRAY['2026-10-18'::date] WHERE id IN('${group}','${secondGroup}');UPDATE org_staff SET sections_access='["documents.write","journals.write"]' WHERE id='${staff}';`);
  const mark=(g=group,u=student,revision:number|null=null)=>db.query<any>('SELECT save_group_class_journal_mark($1,$2,$3,$4,1,$5,$6,$7) data',[org,g,course,u,'2026-10-18',revision,'5']);
  await as(teacher);expect((await mark()).rows[0].data.revision).toBe(1);
  await db.exec('SAVEPOINT mark');await expect(mark(secondGroup,second)).rejects.toThrow(/group_journal_scope_denied/);await db.exec('ROLLBACK TO mark');
  await db.exec('SAVEPOINT mark');await expect(mark(group,student,0)).rejects.toThrow(/revision_conflict/);await db.exec('ROLLBACK TO mark');
  await as(viewer);await db.exec('SAVEPOINT mark');await expect(mark()).rejects.toThrow(/group_journal_scope_denied/);await db.exec('ROLLBACK TO mark');
  await as(teacher);expect((await db.query('SELECT * FROM group_class_journal_marks')).rows).toHaveLength(1);
 });
 it('journal DML cannot update unassigned pupils even with explicit journals.write',async()=>{
  await assign();await db.exec(`RESET ROLE;UPDATE org_staff SET sections_access='["journals.write"]' WHERE id='${staff}';`);await as(teacher);
  expect((await db.query("UPDATE journal_entries SET value='Updated' RETURNING id")).rows).toEqual([{id:id(36)}]);
  await db.exec('SAVEPOINT mark');await expect(db.query(`INSERT INTO journal_entries(id,journal_id,user_id,value)VALUES('${id(60)}','${id(35)}','${second}','Forged')`)).rejects.toThrow(/row-level security/);await db.exec('ROLLBACK TO mark');
 });
 it('allows real group-contract staging layout only for the assigned writer',async()=>{
  await assign();await db.exec(`RESET ROLE;UPDATE org_staff SET sections_access='["documents.write"]' WHERE id='${staff}';`);await as(teacher);
  const path=`${org}/contracts/${group}/job-key/100_contract.pdf`;
  await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',path]);
  for(const denied of [`${org}/contracts/${secondGroup}/job-key/100_contract.pdf`,`${org}/bulk/job/100.pdf`]){
   await db.exec('SAVEPOINT upload');await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',denied])).rejects.toThrow(/row-level security/);await db.exec('ROLLBACK TO upload');
  }
 });
 it('protects actual org_contracts HTML/roster rows and preserves explicit personal learner party',async()=>{
  await assign();await db.exec(`RESET ROLE;
   INSERT INTO org_contracts(organization_id,student_group_id,student_user_id,body_html,students)VALUES
   ('${org}','${group}','${student}','Assigned HTML','[{"user_id":"${student}"}]'),
   ('${org}','${secondGroup}','${second}','Other HTML','[{"user_id":"${second}"}]'),
   ('${org}','${group}',NULL,'Mismatched embedded roster','[{"user_id":"${second}"}]');`);
  await as(teacher);expect((await db.query('SELECT body_html FROM org_contracts')).rows).toEqual([{body_html:'Assigned HTML'}]);
  await as(student);expect((await db.query('SELECT body_html FROM org_contracts')).rows).toEqual([{body_html:'Assigned HTML'}]);
  await as(owner);await assign([],1);await as(teacher);expect((await db.query('SELECT * FROM org_contracts')).rows).toHaveLength(0);
 });
 it('validates a contract personal learner even for organization-wide writers',async()=>{
  const check=(u:string)=>row('SELECT uc_document_contract_scope($1,NULL,$2,NULL,\'[]\') ok',[org,u]);
  expect(await check(student)).toEqual({ok:true});expect(await check(id(99))).toEqual({ok:false});
  await db.exec(`RESET ROLE;INSERT INTO profiles(user_id,organization_id)VALUES('${id(99)}','${other}');`);
  await as(owner);expect(await check(id(99))).toEqual({ok:false});
 });
 it('authorizes signature source before insertion and exact existing DOCX contract paths',async()=>{
  await assign();await db.exec(`RESET ROLE;
   INSERT INTO org_contracts(id,organization_id,student_group_id,students,docx_path)VALUES
   ('${id(65)}','${org}','${group}','[{"user_id":"${student}"}]','organizations/${org}/group-contracts/${id(65)}.docx'),
   ('${id(66)}','${org}','${secondGroup}','[{"user_id":"${second}"}]','organizations/${org}/group-contracts/${id(66)}.docx');
   INSERT INTO storage.objects(bucket_id,name)VALUES('billing-documents','organizations/${org}/group-contracts/${id(65)}.docx'),('billing-documents','organizations/${org}/group-contracts/${id(66)}.docx');`);
  await as(teacher);
  expect(await row('SELECT uc_document_signature_source_scope($1,$2) ok',[org,id(65)])).toEqual({ok:true});
  expect(await row('SELECT uc_document_signature_source_scope($1,$2) ok',[org,id(66)])).toEqual({ok:false});
  expect(await row('SELECT uc_document_signature_source_scope($1,$2) ok',[other,id(65)])).toEqual({ok:false});
  expect((await db.query("SELECT name FROM storage.objects WHERE name LIKE '%/group-contracts/%'")).rows).toEqual([{name:`organizations/${org}/group-contracts/${id(65)}.docx`}]);
 });
});
