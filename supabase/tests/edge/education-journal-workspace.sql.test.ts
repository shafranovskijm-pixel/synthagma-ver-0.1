// @vitest-environment node
// Actual new SQL and freshly captured authority functions. Synthetic in-memory
// rows only. Billing gates and the separate admission projection are explicit
// fixture collaborators; this is not an HTTP/native concurrency acceptance.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, afterAll, afterEach, expect, it } from 'vitest';
const db = new PGlite();
const read = (p: string) => readFile(new URL('../../../' + p, import.meta.url), 'utf8');
const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const org=id(1),otherOrg=id(2),owner=id(10),student=id(11),peer=id(12),teacher=id(13),sales=id(14),viewer=id(15),expired=id(16),foreigner=id(17);
const course=id(20),lesson=id(21),enrollment=id(30),peerEnrollment=id(31),groupA=id(40),groupB=id(41),state=id(50),criteria=id(51),program=id(52),session=id(53);
const scope = {kind:'student',student_user_id:student,enrollment_id:null,group_id:null};
const as = async (who: string|null,role='authenticated') => {await db.exec('RESET ROLE; SET ROLE '+role); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[who??'',role]);};
const rpc = async (s: any=scope,q: any={kind:'summary'},o=org) => (await db.query<{r:any}>('SELECT public.uc_read_education_journal_workspace($1,$2::jsonb,$3::jsonb) r',[o,JSON.stringify(s),JSON.stringify(q)])).rows[0].r;
const rows = async (type: string,s: any=scope,extra={}) => rpc(s,{kind:'rows',journal_type:type,after:null,limit:100,snapshot_key:null,...extra});
const fail = async (f: ()=>Promise<any>,code='42501') => {await db.exec('SAVEPOINT denial');try {await expect(f()).rejects.toMatchObject({code});} finally {await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');}};
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 CREATE TYPE app_role AS ENUM('admin','organization','student','company','sales_manager');
 CREATE TABLE organizations(id uuid PRIMARY KEY,name text); CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,full_name text,archived_at timestamptz,blocked_at timestamptz);
 CREATE TABLE user_roles(user_id uuid,role app_role); CREATE TABLE org_staff(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz);
 CREATE TABLE admin_staff(user_id uuid,role text,expires_at timestamptz); CREATE TABLE account_deletion_revocations(user_id uuid);
 CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid,title text); CREATE TABLE lessons(id uuid PRIMARY KEY,course_id uuid,title text,type text,content text);
 CREATE TABLE enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,learning_progress_reset_at timestamptz,learning_progress_epoch bigint DEFAULT 0,UNIQUE(user_id,course_id));
 CREATE TABLE student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,name text);
 CREATE TABLE student_group_memberships_effective(organization_id uuid,group_id uuid,user_id uuid);
 CREATE TABLE org_staff_document_groups(staff_id uuid,organization_id uuid,group_id uuid);
 CREATE TABLE lesson_progress(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,completed boolean,completed_at timestamptz);
 CREATE TABLE test_attempts(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,session_id uuid,completed_at timestamptz,score integer,max_score integer,passed boolean,answers jsonb);
 CREATE TABLE homework_submissions(id uuid PRIMARY KEY,organization_id uuid,student_id uuid,course_id uuid,lesson_id uuid,status text,score integer,reviewed_at timestamptz,submitted_at timestamptz,content text,attachments jsonb,reviewer_comment text,learning_progress_epoch bigint DEFAULT 0);
 CREATE TABLE group_program_enrollment_snapshots(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,version_id uuid);
 CREATE TABLE uc_learning_outcome_states(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,criteria_id uuid,program_version_id uuid,program_enrollment_snapshot_id uuid,decision_id uuid);
 CREATE TABLE uc_learning_criteria_versions(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,program_version_id uuid,state text,redacted boolean DEFAULT false,revision bigint,definition jsonb);
 CREATE TABLE uc_learning_attempt_contexts(session_id uuid,user_id uuid,lesson_id uuid,state_id uuid,criteria_id uuid,binding_state text,scope jsonb);
 CREATE TABLE uc_learning_attestation_decisions(id uuid PRIMARY KEY,state_id uuid,organization_id uuid,user_id uuid,redacted boolean DEFAULT false,recorded_at timestamptz,outcome text,revision_created bigint);
 CREATE TABLE uc_conducted_sessions(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,group_id uuid,lesson_id uuid);
 CREATE TABLE uc_conducted_session_versions(id uuid PRIMARY KEY,session_id uuid,organization_id uuid,redacted boolean DEFAULT false,revision bigint,attendance jsonb,starts_at timestamptz);
 CREATE TABLE uc_automatic_admission_drafts(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,document_date date,recorded_at timestamptz,status text,revision bigint);
 CREATE FUNCTION public.uc_admission_draft_projection(uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"stale":false,"registered_locked":false}'::jsonb$$;
 CREATE TABLE education_document_records(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,deleted_at timestamptz,created_at timestamptz,document_type text,document_number text);
 CREATE TABLE uc_education_issuance_states(record_id uuid PRIMARY KEY,organization_id uuid,user_id uuid,redacted boolean DEFAULT false,annulment jsonb,revision bigint);
 CREATE TABLE uc_document_registry_records(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,scope_group_ids uuid[] DEFAULT '{}',data jsonb,context_binding jsonb,redacted boolean DEFAULT false,registration_id text,status text,registered_at timestamptz,revision bigint);
 CREATE TABLE uc_copy_registry_records(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,data jsonb,redacted boolean DEFAULT false,registration_id text,archived boolean DEFAULT false,registered_at timestamptz,revision bigint,copy_type text);
 CREATE SCHEMA billing_access_private; CREATE TABLE billing_access_private.fixture_actor_holds(user_id uuid); CREATE TABLE billing_access_private.fixture_target_holds(organization_id uuid);
 CREATE FUNCTION billing_access_private.actor_allowed(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT $1 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing_access_private.fixture_actor_holds WHERE user_id=$1)$$;
 CREATE FUNCTION billing_access_private.target_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT billing_access_private.actor_allowed($2) AND NOT EXISTS(SELECT 1 FROM billing_access_private.fixture_target_holds WHERE organization_id=$1)$$;`);
 await db.exec(await read('supabase/tests/fixtures/education-journal-defaults-20261119.sql'));
 const captured = (await Promise.all(['education-journal-supporting-guards-20261119.json','education-journal-guards-20261119.json'].map(async p=>JSON.parse(await read('supabase/tests/fixtures/'+p)).functions))).flat();
 let pending=captured.map((f:any)=>f.definition);
 for(let round=0;pending.length&&round<10;round++) {const next:string[]=[];for(const sql of pending)try{await db.exec(sql);}catch(e:any){if(e.code!=='42883')throw e;next.push(sql);}if(next.length===pending.length)throw Error('Unresolved captured guard dependency');pending=next;}
 expect(pending).toHaveLength(0);
 await db.exec(await read('supabase/migrations/20261119110000_education_journal_workspace.sql'));
 await db.query('INSERT INTO organizations VALUES($1,$2),($3,$4)',[org,'Synthetic UC',otherOrg,'Other UC']);
 for(const [u,o,label] of [[owner,org,'Owner'],[student,org,'Student'],[peer,org,'Peer secret'],[teacher,org,'Teacher'],[sales,org,'Sales'],[viewer,org,'Viewer'],[expired,org,'Expired'],[foreigner,otherOrg,'Foreign']])await db.query('INSERT INTO profiles VALUES($1,$2,$3,NULL,NULL)',[u,o,label]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'admin'),($5,'admin'),($6,'organization')",[owner,student,peer,viewer,expired,foreigner]);
 await db.query("INSERT INTO admin_staff VALUES($1,'viewer',NULL),($2,'admin',now()-interval '1 day')",[viewer,expired]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role) VALUES($1,$2,$3,'teacher'),($4,$5,$3,'sales_manager')",[id(60),teacher,org,id(61),sales]);
 await db.query('INSERT INTO courses VALUES($1,$2,$3)',[course,org,'Synthetic course']);
 await db.query("INSERT INTO lessons VALUES($1,$2,'Test lesson','test','SECRET BODY')",[lesson,course]);
 await db.query('INSERT INTO enrollments(id,user_id,course_id) VALUES($1,$2,$3),($4,$5,$3)',[enrollment,student,course,peerEnrollment,peer]);
 await db.query("INSERT INTO student_groups VALUES($1,$3,$4,'A'),($2,$3,$4,'B')",[groupA,groupB,org,course]);
 for(const g of [groupA,groupB])for(const u of [student,peer])await db.query('INSERT INTO student_group_memberships_effective VALUES($1,$2,$3)',[org,g,u]);
 await db.query('INSERT INTO org_staff_document_groups VALUES($1,$2,$3)',[id(60),org,groupA]);
 await db.query("INSERT INTO lesson_progress VALUES($1,$2,$3,true,'2026-11-01Z'),($4,$5,$3,true,'2026-11-02Z')",[id(70),student,lesson,id(71),peer]);
 await db.query("INSERT INTO test_attempts VALUES($1,$2,$3,$4,'2026-11-03Z',1,10,NULL,'{\"secret_answer\":42}'),($5,$6,$3,$7,'2026-11-04Z',10,10,true,'{}')",[id(72),student,lesson,session,id(73),peer,id(74)]);
 await db.query("INSERT INTO uc_learning_criteria_versions VALUES($1,$2,$3,$4,'approved',false,1,$5)",[criteria,org,course,program,JSON.stringify({main:{kind:'test',lesson_id:lesson}})]);
 await db.query('INSERT INTO uc_learning_outcome_states VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)',[state,org,enrollment,student,course,groupB,criteria,program,id(54)]);
 await db.query('INSERT INTO group_program_enrollment_snapshots VALUES($1,$2,$3,$4,$5,$6,$7)',[id(54),org,groupB,enrollment,student,course,program]);
 await db.query("INSERT INTO uc_learning_attempt_contexts VALUES($1,$2,$3,$4,$5,'bound',$6)",[session,student,lesson,state,criteria,JSON.stringify({organization_id:org,group_id:groupB,user_id:student,course_id:course,enrollment_id:enrollment,program_enrollment_snapshot_id:id(54),program_version_id:program})]);
 await db.query("INSERT INTO uc_learning_attestation_decisions VALUES($1,$2,$3,$4,false,'2026-11-05Z','passed',1)",[id(75),state,org,student]);
 await db.query('UPDATE uc_learning_outcome_states SET decision_id=$1 WHERE id=$2',[id(75),state]);
 for(const [g,n] of [[groupA,80],[groupB,81]] as const){
  await db.query('INSERT INTO uc_conducted_sessions VALUES($1,$2,$3,$4,$5)',[id(n),org,course,g,lesson]);
  await db.query("INSERT INTO uc_conducted_session_versions VALUES($1,$2,$3,false,1,$4,'2026-11-06Z')",[id(n+2),id(n),org,JSON.stringify([{user_id:student,enrollment_id:enrollment,status:'present'},{user_id:peer,enrollment_id:peerEnrollment,status:'absent'}])]);
 }
 await db.query("INSERT INTO uc_automatic_admission_drafts VALUES($1,$2,$3,$4,$5,$6,'2026-11-07','2026-11-07Z','prepared',1)",[id(90),org,enrollment,student,course,groupB]);
 await db.query("INSERT INTO education_document_records VALUES($1,$2,$3,$4,$5,$6,NULL,'2026-11-08Z','certificate','001')",[id(91),org,enrollment,student,course,groupB]);
 for(const [n,g,subject] of [[100,groupA,{kind:'none'}],[101,groupB,{kind:'none'}],[102,groupB,{kind:'student',user_id:student}],[103,groupB,{kind:'student',user_id:peer}]] as const)await db.query("INSERT INTO uc_document_registry_records(id,organization_id,group_id,data,context_binding,registration_id,status,registered_at,revision) VALUES($1,$2,$3,$4,$5,$6,'registered','2026-11-09Z',1)",[id(n),org,g,JSON.stringify({subject,document_type:'enrollment_order',title:'GROUP SECRET PEERS',notes:'SECRET NOTES'}),JSON.stringify({kind:'enrollment',organization_id:org,enrollment_id:subject.kind==='student'&&subject.user_id===peer?peerEnrollment:enrollment,user_id:subject.kind==='student'?subject.user_id:null,course_id:course}),'REG-'+n]);
 for(const [n,subject,recipient] of [[110,student,peer],[111,peer,student]] as const)await db.query("INSERT INTO uc_copy_registry_records(id,organization_id,group_id,data,registration_id,registered_at,revision,copy_type) VALUES($1,$2,$3,$4,$5,'2026-11-10Z',1,'copy')",[id(n),org,groupB,JSON.stringify({subject:{kind:'person',user_id:subject},recipient:{kind:'person',user_id:recipient},notes:'SECRET COPY'}),'COPY-'+n]);
 await db.exec("UPDATE uc_document_registry_records SET data=data||jsonb_build_object('context',jsonb_build_object('kind','enrollment','enrollment_id',context_binding->>'enrollment_id')) WHERE data->'subject'->>'kind'='student'");
},30_000);
beforeEach(async()=>{await db.exec('RESET ROLE; BEGIN');await as(owner);});
afterEach(()=>db.exec('RESET ROLE; ROLLBACK'));
afterAll(()=>db.close());

it('uses readonly authenticated-only entry and private inaccessible helpers',async()=>{
 await fail(()=>db.query('SELECT * FROM uc_education_journal_private.enrollments($1,$2)',[org,scope]));
 for(const role of ['anon','service_role']){await as(student,role);await fail(()=>rpc());}
 await as(owner);expect((await rpc({kind:'organization'})).journals).toHaveLength(9);
});
it('own extract contains exact learner only, no peer, group document content, answers or lesson content',async()=>{
 await as(student);
 for(const type of ['activity','current_control','final_tests','attestation_decisions','conducted_sessions','admission_orders','education_documents','document_registration','copies_duplicates']){
  const r=await rows(type);expect(r.rows.every((v:any)=>v.student_user_id===student)).toBe(true);
  expect(JSON.stringify(r)).not.toMatch(/Peer secret|SECRET|secret_answer|GROUP SECRET/);
 }
 expect((await rows('document_registration')).rows).toHaveLength(1);
 expect((await rows('copies_duplicates')).rows).toHaveLength(1);
});
it('learner cannot request peer, organization, group-only or another tenant',async()=>{
 await as(student);for(const s of [{...scope,student_user_id:peer},{kind:'organization'},{kind:'group',group_id:groupA}])await fail(()=>rpc(s));
 await fail(()=>rpc(scope,{kind:'summary'},otherOrg));
});
it('teacher A sees own conducted records but no B records for the same learner and course',async()=>{
 await as(teacher);
 expect((await rows('activity')).rows).toHaveLength(1);
 expect((await rows('current_control')).rows).toHaveLength(0);
 expect((await rows('conducted_sessions')).rows.map((r:any)=>r.group_id)).toEqual([groupA]);
 for(const type of ['final_tests','attestation_decisions','admission_orders','education_documents','copies_duplicates'])expect((await rows(type)).rows).toHaveLength(0);
 const r=await rows('document_registration',{kind:'organization'});expect(r.rows.map((r:any)=>r.source_id)).toEqual([id(100)]);
 await fail(()=>rpc({kind:'group',group_id:groupB}));
});
it('owner and valid platform viewer retain read access while sales and expired admin do not',async()=>{
 for(const u of [owner,viewer]){await as(u);expect((await rows('final_tests')).rows).toHaveLength(1);}
 for(const u of [sales,expired,foreigner]){await as(u);await fail(()=>rpc());}
});
it('revocation, profile block and upstream billing hold deny own reads',async()=>{
 for(const sql of ['INSERT INTO account_deletion_revocations VALUES($1)','UPDATE profiles SET blocked_at=now() WHERE user_id=$1','INSERT INTO billing_access_private.fixture_actor_holds VALUES($1)']){
  await db.exec('RESET ROLE; SAVEPOINT blocked');await db.query(sql,[student]);await as(student);await fail(()=>rpc());await db.exec('RESET ROLE; ROLLBACK TO SAVEPOINT blocked; RELEASE SAVEPOINT blocked');
 }
});
it('completion is not credit and legacy NULL passed is never regraded at an invented threshold',async()=>{
 expect((await rows('activity')).rows[0].result).toContain('зачёт этим не подтверждаются');
 expect((await rows('current_control')).rows[0].result).toContain('Результат не подтверждён');
 expect((await rows('final_tests')).rows[0].result).toBe('Результат не подтверждён');
});
it('progress reset hides old current progress while keeping old attempts and marking history',async()=>{
 await db.exec('RESET ROLE');await db.query("UPDATE enrollments SET learning_progress_reset_at='2026-11-15Z' WHERE id=$1",[enrollment]);await as(student);
 expect((await rows('activity')).rows).toHaveLength(1);expect((await rows('activity')).rows[0].source_label).toContain('до последнего сброса');
 expect((await rows('current_control')).rows[0].source_label).toContain('до последнего сброса');
 expect((await rows('final_tests')).rows[0].source_label).toContain('до последнего сброса');
});
it('unconfigured final criteria are unknown; explicit human criterion is not applicable',async()=>{
 await db.exec('RESET ROLE');await db.query('UPDATE uc_learning_outcome_states SET criteria_id=NULL WHERE id=$1',[state]);await as(owner);
 let j=(await rpc()).journals.find((j:any)=>j.journal_type==='final_tests');expect(j).toMatchObject({state:'unavailable',record_count:null});
 await db.exec('RESET ROLE');await db.query('UPDATE uc_learning_outcome_states SET criteria_id=$1 WHERE id=$2',[criteria,state]);await db.query("UPDATE uc_learning_criteria_versions SET definition='{\"main\":{\"kind\":\"human_assessment\"}}' WHERE id=$1",[criteria]);await as(owner);
 j=(await rpc()).journals.find((j:any)=>j.journal_type==='final_tests');expect(j).toMatchObject({state:'not_applicable',record_count:null});
 expect((await rows('current_control')).rows).toHaveLength(1);
});
it('latest redacted conducted version does not resurrect an older attendance record',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO uc_conducted_session_versions VALUES($1,$2,$3,true,2,'[]','2026-11-06Z')",[id(89),id(80),org]);await as(owner);
 const r=await rows('conducted_sessions');expect(r.rows).toHaveLength(1);expect(r.rows[0].group_id).toBe(groupB);
});
it('wrong user/lesson/session and non-approved criteria never become final tests',async()=>{
 await db.exec('RESET ROLE');await db.query('UPDATE uc_learning_attempt_contexts SET user_id=$1',[peer]);await as(owner);expect((await rows('final_tests')).rows).toHaveLength(0);
 await db.exec('RESET ROLE');await db.query('UPDATE uc_learning_attempt_contexts SET user_id=$1',[student]);await db.query("UPDATE uc_learning_criteria_versions SET state='draft'");await as(owner);expect((await rows('final_tests')).rows).toHaveLength(0);
});
it('pages are stable, duplicate-free and refuse source changes before export continuation',async()=>{
 const s={kind:'organization'};const a=await rows('document_registration',s,{limit:2});expect(a.rows).toHaveLength(2);expect(a.next_cursor).toBeTruthy();
 const b=await rows('document_registration',s,{limit:2,after:a.next_cursor,snapshot_key:a.snapshot_key});expect(b.rows).toHaveLength(2);expect(new Set([...a.rows,...b.rows].map(r=>r.id)).size).toBe(4);
 await db.exec('RESET ROLE');await db.query("UPDATE uc_document_registry_records SET status='archived' WHERE id=$1",[id(102)]);await as(owner);
 await fail(()=>rows('document_registration',s,{after:a.next_cursor,snapshot_key:a.snapshot_key}),'22023');
});
it('specific enrollment excludes unbound copy registry instead of inventing its course',async()=>{
 const s={...scope,enrollment_id:enrollment};expect((await rows('copies_duplicates',s)).rows).toHaveLength(0);
 expect((await rpc(s)).journals.find((j:any)=>j.journal_type==='copies_duplicates')).toMatchObject({state:'unavailable',record_count:null});
});
it('homework metadata contributes current control without answers, attachments or automatic attestation',async()=>{
 await db.exec('RESET ROLE');await db.query("INSERT INTO homework_submissions VALUES($1,$2,$3,$4,$5,'approved',5,'2026-11-12Z','2026-11-11Z','SECRET BODY','[\"SECRET FILE\"]','SECRET COMMENT',0)",[id(130),org,student,course,lesson]);await as(student);
 const r=await rows('current_control');expect(r.rows).toHaveLength(2);expect(r.rows[0].result).toBe('Задание принято · оценка 5');expect(JSON.stringify(r)).not.toContain('SECRET');
 expect((await rows('attestation_decisions')).rows).toHaveLength(1);
});
it('retained programme binding must match the actual attempt context and state',async()=>{
 await db.exec('RESET ROLE');await db.query("UPDATE uc_learning_attempt_contexts SET scope=scope||jsonb_build_object('program_version_id',$1::text)",[id(999)]);await as(owner);expect((await rows('final_tests')).rows).toHaveLength(0);
 await db.exec('RESET ROLE');await db.query('UPDATE group_program_enrollment_snapshots SET user_id=$1',[peer]);await as(owner);expect((await rows('attestation_decisions')).rows).toHaveLength(0);
});
it('registry course linkage requires agreement between declared context and retained binding',async()=>{
 const s={...scope,enrollment_id:enrollment};expect((await rows('document_registration',s)).rows).toHaveLength(1);
 await db.exec('RESET ROLE');await db.query("UPDATE uc_document_registry_records SET data=jsonb_set(data,'{context,enrollment_id}',to_jsonb($1::text)) WHERE id=$2",[peerEnrollment,id(102)]);await as(student);
 expect((await rows('document_registration',s)).rows).toHaveLength(0);
 const r=await rows('document_registration');expect(r.rows).toHaveLength(1);expect(r.rows[0].enrollment_id).toBeNull();expect(r.rows[0].course_id).toBeNull();
});
it('future completion capture survives progress deletion and records a new epoch once',async()=>{
 await db.exec('RESET ROLE');await db.query('DELETE FROM lesson_progress WHERE user_id=$1',[student]);await db.query("UPDATE enrollments SET learning_progress_epoch=1,learning_progress_reset_at='2026-11-15Z' WHERE id=$1",[enrollment]);
 await db.query("INSERT INTO lesson_progress VALUES($1,$2,$3,true,'2026-11-16Z')",[id(140),student,lesson]);await db.query('UPDATE lesson_progress SET completed=true WHERE id=$1',[id(140)]);await as(student);
 const r=await rows('activity');expect(r.rows).toHaveLength(2);expect(new Set(r.rows.map((r:any)=>r.source_revision))).toEqual(new Set([0,1]));
 await fail(()=>db.query('DELETE FROM public.uc_online_completion_events'));
});
it('rejects malformed and widened scope/query objects without partial success',async()=>{
 for(const s of [{kind:'organization',group_id:groupA},{kind:'student',student_user_id:student},{...scope,enrollment_id:'invalid'},{kind:'group',group_id:otherOrg}])await fail(()=>rpc(s),s.group_id===otherOrg?'42501':'22023');
 await fail(()=>rows('activity',scope,{limit:101}),'22023');await fail(()=>rows('activity',scope,{after:'bad'}),'22023');await fail(()=>rpc(scope,{kind:'summary',extra:true}),'22023');
});
