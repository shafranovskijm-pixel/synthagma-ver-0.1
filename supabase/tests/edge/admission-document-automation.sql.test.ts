// @vitest-environment node
// Runs the actual new migration in PostgreSQL/PGlite. Upstream identity/billing/
// group-authority/programme collaborators below are explicit synthetic fixtures,
// not evidence of production OAuth or a multi-session lock-wait experiment.
import { PGlite } from '@electric-sql/pglite';
import { settingsSchema, mutationSchema } from '@/lib/admissionDocuments/contract';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1), otherOrg=id(2), owner=id(10), teacher=id(11), learner=id(12), peer=id(13), blocked=id(14), expired=id(15), sales=id(16);
const course=id(20), otherCourse=id(21), group=id(30), otherGroup=id(31), foreignGroup=id(32), enrollment=id(40), peerEnrollment=id(41), historical=id(42);
let db:PGlite;
const one=async(sql:string,params:unknown[]=[]) => (await db.query<any>(sql,params)).rows[0];
const read=async(scope:unknown) => (await one('SELECT read_admission_document_settings($1,$2::jsonb) value',[org,JSON.stringify(scope)])).value;
let request=100;
const mutate=async(scope:unknown,command:unknown,revision=0,requestId=id(++request)) => (await one('SELECT apply_admission_document_settings($1,$2::jsonb,$3,$4,$5::jsonb) value',[org,JSON.stringify(scope),revision,requestId,JSON.stringify(command)])).value;
const orgScope={kind:'organization'}, groupScope={kind:'group',group_id:group};
const scope={kind:'enrollment',enrollment_id:enrollment,group_id:group};
const save=(patch:Record<string,unknown>={})=>({action:'save',reason:'manual_settings',enabled:null,document_date:null,effective_admission_date:null,timezone:null,...patch});
const prepare={action:'prepare_existing',reason:'prepare_existing'};
const reset={action:'reset',reason:'inherit_reset'};
const actAs=async(actor=owner,role='authenticated')=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[actor,role]);await db.exec(`SET ROLE ${role}`);};
const fixtureSQL=`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
 CREATE TABLE organizations(id uuid PRIMARY KEY,name text);
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,full_name text,student_group_id uuid,archived_at timestamptz);
 CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid,title text);
 CREATE TABLE student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,name text);
 CREATE TABLE memberships(organization_id uuid,group_id uuid,user_id uuid,PRIMARY KEY(group_id,user_id));
 CREATE VIEW student_group_memberships_effective AS SELECT * FROM memberships;
 CREATE TABLE enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,started_at timestamptz,status text,document_facts_revision bigint DEFAULT 1);
 CREATE TABLE program_fact_versions(id uuid PRIMARY KEY,facts jsonb);
 CREATE TABLE fixture_programs(enrollment_id uuid PRIMARY KEY,program_ref jsonb);
 CREATE TABLE uc_document_registry_records(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,scope_group_ids uuid[],participant_ids uuid[],data jsonb,context_binding jsonb,redacted boolean DEFAULT false);
 CREATE TABLE fixture_actors(user_id uuid PRIMARY KEY,organization_id uuid,role text,blocked boolean DEFAULT false,revoked boolean DEFAULT false,expired boolean DEFAULT false,allowed_groups uuid[]);
 CREATE FUNCTION account_deletion_access_allowed()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM fixture_actors WHERE user_id=auth.uid()AND NOT revoked)$$;
 CREATE FUNCTION uc_platform_document_action_allowed(uuid,text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM fixture_actors WHERE user_id=$1 AND NOT revoked AND NOT expired AND($2='read'OR role IN('owner','teacher')))$$;
 CREATE FUNCTION uc_identification_actor_allowed(uuid,boolean)RETURNS boolean LANGUAGE sql STABLE AS $$SELECT uc_platform_document_action_allowed($1,CASE WHEN $2 THEN 'write'ELSE'read'END)$$;
 CREATE FUNCTION is_user_blocked(uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT NOT EXISTS(SELECT 1 FROM fixture_actors WHERE user_id=$1 AND NOT blocked)$$;
 CREATE FUNCTION uc_identification_target_allowed(uuid,uuid,boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id=$2 AND organization_id=$1 AND(NOT $3 OR archived_at IS NULL))$$;
 CREATE FUNCTION can_access_organization(uuid,text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM fixture_actors WHERE user_id=auth.uid()AND organization_id=$1 AND NOT revoked AND NOT expired AND(role='owner'OR role='teacher'AND $2 IN('documents.read','documents.write','students.read','students.write')OR role IN('learner','sales')AND $2 IN('documents.read','students.read')))$$;
 CREATE FUNCTION uc_document_scope_allowed(uuid,uuid,uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM fixture_actors a WHERE a.user_id=auth.uid()AND a.organization_id=$1 AND a.role IN('owner','teacher')
 AND($2 IS NULL OR EXISTS(SELECT 1 FROM student_groups g WHERE g.id=$2 AND g.organization_id=$1))
 AND($3 IS NULL OR EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=$3 AND c.organization_id=$1))
 AND(a.role='owner'OR $2 IS NOT NULL AND $2=ANY(a.allowed_groups)OR $2 IS NULL AND $3 IS NOT NULL AND EXISTS(SELECT 1 FROM enrollments e JOIN memberships m ON m.user_id=e.user_id WHERE e.id=$3 AND m.organization_id=$1 AND m.group_id=ANY(a.allowed_groups))))$$;
 CREATE FUNCTION uc_document_action_allowed(uuid,text,uuid,uuid)RETURNS boolean LANGUAGE sql STABLE AS $$SELECT can_access_organization($1,'documents.'||$2)AND uc_document_scope_allowed($1,$3,$4)$$;
 CREATE FUNCTION uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=$3 AND e.user_id=$4 AND e.course_id=$5 AND c.organization_id=$1 AND($2 IS NULL OR EXISTS(SELECT 1 FROM student_groups g JOIN memberships m ON m.group_id=g.id AND m.organization_id=g.organization_id WHERE g.id=$2 AND g.organization_id=$1 AND g.course_id=$5 AND m.user_id=$4)))AND uc_document_scope_allowed($1,$2,$3)$$;
 CREATE FUNCTION uc_admission_program(uuid,uuid,uuid,uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT program_ref FROM fixture_programs WHERE enrollment_id=$4$$;
 CREATE FUNCTION uc_custom_journal_shape(p jsonb,p_keys text[])RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$BEGIN IF jsonb_typeof(p)IS DISTINCT FROM'object'THEN RETURN false;END IF;RETURN coalesce(p?&p_keys AND(SELECT count(*)FROM jsonb_object_keys(p))=cardinality(p_keys),false);END$$;
 CREATE FUNCTION uc_custom_journal_uuid(p jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT coalesce(jsonb_typeof(p)='string'AND p#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 INSERT INTO organizations VALUES('${org}','Учебный центр'),('${otherOrg}','Другой центр');
 INSERT INTO courses VALUES('${course}','${org}','Курс'),('${otherCourse}','${org}','Другой курс');
 INSERT INTO profiles(user_id,organization_id,full_name)VALUES('${owner}','${org}','Владелец'),('${teacher}','${org}','Преподаватель'),('${learner}','${org}','Ученик'),('${peer}','${org}','Другой ученик'),('${blocked}','${org}','Заблокирован'),('${expired}','${org}','Истёкший'),('${sales}','${org}','Продажи');
 INSERT INTO student_groups VALUES('${group}','${org}','${course}','Группа А'),('${otherGroup}','${org}','${course}','Группа Б'),('${foreignGroup}','${otherOrg}','${course}','Чужая группа');
 INSERT INTO memberships VALUES('${org}','${group}','${learner}'),('${org}','${group}','${peer}');
 INSERT INTO fixture_actors VALUES('${owner}','${org}','owner',false,false,false,NULL),('${teacher}','${org}','teacher',false,false,false,ARRAY['${group}']::uuid[]),('${learner}','${org}','learner',false,false,false,NULL),('${blocked}','${org}','owner',true,false,false,NULL),('${expired}','${org}','owner',false,false,true,NULL),('${sales}','${org}','sales',false,false,false,NULL);
 INSERT INTO enrollments VALUES('${historical}','${learner}','${otherCourse}',NULL,'active',1);
`;
beforeAll(async()=>{db=new PGlite();await db.exec(fixtureSQL);await db.exec(readFileSync('supabase/migrations/20261119090000_uc_automatic_admission_drafts.sql','utf8'));},30000);
 beforeEach(async()=>{await db.exec(`RESET ROLE;TRUNCATE uc_admission_document_preferences,uc_automatic_admission_drafts,uc_admission_document_preference_events,uc_admission_document_requests CASCADE;DELETE FROM enrollments WHERE id<>'${historical}';UPDATE fixture_actors SET revoked=false;UPDATE fixture_actors SET allowed_groups=ARRAY['${group}']::uuid[]WHERE user_id='${teacher}';DELETE FROM uc_document_registry_records;DELETE FROM fixture_programs;DELETE FROM memberships WHERE group_id='${otherGroup}';`);await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,NULL,'active',1),($4,$5,$3,'2001-01-01','active',1)`,[enrollment,learner,course,peerEnrollment,peer]);await actAs();});
afterAll(async()=>db?.close());
import { afterEach } from 'vitest';
afterEach(async()=>{await db.exec('RESET ROLE');});

describe('actual admission draft migration (synthetic upstream authority adapters)',()=>{
 it('does not backfill previous enrollments or alter their learning timestamps',async()=>{
  await db.exec('RESET ROLE');expect((await one('SELECT count(*) n FROM uc_automatic_admission_drafts WHERE enrollment_id=$1',[historical])).n).toBe(0);
  expect((await one('SELECT started_at FROM enrollments WHERE id=$1',[historical])).started_at).toBeNull();
 });
 it('records a durable new intent when started_at is null and never awards a legal decision',async()=>{
  const state=await read(scope);expect(state.draft.status).toBe('needs_information');expect(state.draft.missing_facts).toContain('program_not_confirmed');
  expect(state.draft.document_date).toBe(state.draft.recorded_at.slice(0,10));expect(state.draft.revision).toBe(1);expect(state.draft.program_ref).toBeNull();
  await db.exec('RESET ROLE');expect((await one('SELECT started_at FROM enrollments WHERE id=$1',[enrollment])).started_at).toBeNull();
 });
 it('preserves observed system time when setting independent document and admission dates',async()=>{
  const initial=await read(scope);const changed=await mutate(scope,save({document_date:'2026-10-02',effective_admission_date:'2026-10-01'}));
  expect(changed.state.draft).toMatchObject({document_date:'2026-10-02',effective_admission_date:'2026-10-01',recorded_at:initial.draft.recorded_at,revision:2});
  expect(changed.state.effective.sources.document_date).toBe('enrollment');
 });
 it('inherits org→group→exact enrollment, resets to parent, and leaves peers unchanged',async()=>{
  await mutate(orgScope,save({enabled:false,timezone:'Asia/Vladivostok'}));
  await mutate(groupScope,save({enabled:true,document_date:'2026-11-18',effective_admission_date:'2026-11-17'}));
  expect((await read(scope)).effective).toMatchObject({enabled:true,document_date:'2026-11-18',timezone:'Asia/Vladivostok'});
  await mutate(scope,save({document_date:'2026-11-19'}));
  expect((await read(scope)).effective.document_date).toBe('2026-11-19');
  expect((await read({kind:'enrollment',enrollment_id:peerEnrollment,group_id:group})).effective.document_date).toBe('2026-11-18');
  expect((await read(groupScope)).individual_date_overrides).toBe(1);
  await mutate(scope,reset,1);expect((await read(scope)).effective.document_date).toBe('2026-11-18');
 });
 it('keeps automatic preparation off for new intents while allowing explicit manual preparation',async()=>{
  await mutate(orgScope,save({enabled:false}));await db.exec('RESET ROLE');
  await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,NULL,'active',1)`,[id(44),learner,course]);await actAs();
  const selected={kind:'enrollment',enrollment_id:id(44),group_id:group};expect((await read(selected)).draft.status).toBe('disabled');
  const result=await mutate(selected,prepare);expect(result.state.draft.preparation_mode).toBe('manual');expect(result.state.draft.status).toBe('needs_information');
 });
 it('does not silently refresh existing projects on group-policy edits',async()=>{
  const previous=(await read(scope)).draft;await mutate(groupScope,save({document_date:'2026-11-01'}));
  const stale=(await read(scope)).draft;expect(stale.document_date).toBe(previous.document_date);expect(stale.stale).toBe(true);
  const result=await mutate(groupScope,{action:'apply_current',reason:'apply_to_pending',after_enrollment_id:null},1);
  expect(result.processed).toBe(2);expect((await read(scope)).draft).toMatchObject({document_date:'2026-11-01',stale:false});
 });
 it('requires revision CAS and stable request identity; replay creates no duplicate event',async()=>{
  const requestId=id(99);const command=save({enabled:false});const first=await mutate(groupScope,command,0,requestId);const replay=await mutate(groupScope,command,0,requestId);
  expect(first.replayed).toBe(false);expect(replay.replayed).toBe(true);expect(replay.state.revision).toBe(first.state.revision);
  await expect(mutate(groupScope,save(),0)).rejects.toThrow('REVISION_CONFLICT');
  await expect(mutate(groupScope,save(),0,requestId)).rejects.toThrow('REQUEST_MISMATCH');
  await db.exec('RESET ROLE');expect((await one('SELECT count(*) n FROM uc_admission_document_preference_events')).n).toBe(1);
 });
 it.each(['2026-02-30','2026-1-2','tomorrow'])('rejects invalid date %s without creating preference',async date=>{
  await expect(mutate(groupScope,save({document_date:date}))).rejects.toThrow('INVALID_INPUT');
 });
 it('rejects invalid timezone and cross-tenant exact association',async()=>{
  await expect(mutate(orgScope,save({timezone:'Not/AZone'}))).rejects.toThrow('INVALID_INPUT');
  await expect(mutate({...scope,group_id:foreignGroup},save())).rejects.toThrow('ACCESS_DENIED');
 });
 it.each([learner,sales,blocked,expired])('denies unauthorized/blocked/expired actor %s',async actor=>{
  await actAs(actor);await expect(mutate(scope,save())).rejects.toThrow('ACCESS_DENIED');
 });
 it('denies revoked identity even with otherwise sufficient owner permission',async()=>{
  await db.exec('RESET ROLE');await db.query('UPDATE fixture_actors SET revoked=true WHERE user_id=$1',[owner]);await actAs();await expect(read(scope)).rejects.toThrow('ACCESS_DENIED');
 });
 it('does not lock a learner from participant_ids or another course; locks exact registered subject',async()=>{
  await db.exec('RESET ROLE');await db.query(`INSERT INTO uc_document_registry_records VALUES($1,$2,$3,ARRAY[$3]::uuid[],ARRAY[$4]::uuid[],$5::jsonb,$6::jsonb,false)`,[id(60),org,group,learner,JSON.stringify({document_type:'enrollment_order',subject:{kind:'none'}}),JSON.stringify({})]);
  expect((await one('SELECT uc_admission_document_registered($1,$2) locked',[enrollment,group])).locked).toBe(false);
  const data={document_type:'enrollment_order',subject:{kind:'student',user_id:learner},context:{kind:'enrollment',enrollment_id:enrollment}};
  const binding={kind:'enrollment',organization_id:org,enrollment_id:enrollment,user_id:learner,course_id:otherCourse};
  await db.query('UPDATE uc_document_registry_records SET data=$1::jsonb,context_binding=$2::jsonb',[JSON.stringify(data),JSON.stringify(binding)]);
  expect((await one('SELECT uc_admission_document_registered($1,$2) locked',[enrollment,group])).locked).toBe(false);
  binding.course_id=course;await db.query('UPDATE uc_document_registry_records SET context_binding=$1::jsonb',[JSON.stringify(binding)]);await actAs();
  expect((await read(scope)).draft.registered_locked).toBe(true);await expect(mutate(scope,save({document_date:'2026-01-01'}))).rejects.toThrow('REGISTERED_DOCUMENT');
 });
 it('does not refresh another assigned group via the same learner and course',async()=>{
  await db.exec('RESET ROLE');await db.query('INSERT INTO memberships VALUES($1,$2,$3)',[org,otherGroup,learner]);
  await db.query('SELECT uc_prepare_automatic_admission_draft($1,$2)',[enrollment,otherGroup]);await actAs(teacher);
  await expect(mutate({...scope,group_id:otherGroup},save())).rejects.toThrow('ACCESS_DENIED');
  const limited=await read(scope);expect(limited.draft).toBeNull();expect(limited.capabilities.can_write).toBe(false);
  await expect(mutate(scope,prepare)).rejects.toThrow('ACCESS_DENIED');
  await expect(mutate(scope,save())).rejects.toThrow('ACCESS_DENIED');
  const before=await one('SELECT read_admission_document_settings($1,$2::jsonb) value',[org,JSON.stringify(groupScope)]);
  await mutate(groupScope,{action:'apply_current',reason:'apply_to_pending',after_enrollment_id:null},before.value.revision);
  await db.exec('RESET ROLE');expect((await one('SELECT group_id,revision FROM uc_automatic_admission_drafts WHERE enrollment_id=$1',[enrollment]))).toEqual({group_id:otherGroup,revision:2});
 });
 it('hides a prior group draft after a member moves even when the teacher is assigned both groups',async()=>{
  await db.exec('RESET ROLE');await db.query('INSERT INTO memberships VALUES($1,$2,$3)',[org,otherGroup,learner]);
  await db.query('SELECT uc_prepare_automatic_admission_draft($1,$2)',[enrollment,otherGroup]);
  await db.query('DELETE FROM memberships WHERE group_id=$1 AND user_id=$2',[otherGroup,learner]);
  await db.query('UPDATE fixture_actors SET allowed_groups=ARRAY[$1,$2]::uuid[]WHERE user_id=$3',[group,otherGroup,teacher]);await actAs(teacher);
  expect((await read(scope)).draft).toBeNull();
 });
 it('rejects stale preview and exports a clear one-subject draft without peer data',async()=>{
  const initial=(await read(scope)).draft;await mutate(groupScope,save({document_date:'2026-11-05'}));
  await expect(db.query('SELECT read_automatic_admission_draft($1,$2,$3)',[org,enrollment,initial.revision])).rejects.toThrow('SOURCE_CHANGED');
  const next=(await mutate(scope,prepare)).state.draft;
  const exported=(await one('SELECT read_automatic_admission_draft($1,$2,$3) value',[org,enrollment,next.revision])).value;
  expect(exported.student_name).toBe('Ученик');expect(JSON.stringify(exported)).not.toContain('Другой ученик');expect(exported).not.toHaveProperty('registration_number');expect(exported.status).toBe('needs_information');
 });
 it('keeps ambiguous new assignments unprepared until an explicit allowed group is selected',async()=>{
  await db.exec('RESET ROLE');await db.query('INSERT INTO memberships VALUES($1,$2,$3)',[org,otherGroup,learner]);
  await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,NULL,'active',1)`,[id(44),learner,course]);await actAs();
  const unresolved={kind:'enrollment',enrollment_id:id(44),group_id:null};const before=await read(unresolved);
  expect(before.draft.group_id).toBeNull();expect(before.draft.missing_facts).toContain('ambiguous_group');expect(before.capabilities.can_write).toBe(false);
  const selected=await mutate({...unresolved,group_id:otherGroup},prepare);expect(selected.state.draft.group_id).toBe(otherGroup);expect(selected.state.draft.missing_facts).not.toContain('ambiguous_group');
 });
 it('binds the prepared draft to confirmed programme references and detects a later source change',async()=>{
  const programRef={enrollment_snapshot_id:id(71),binding_id:id(72),binding_revision:1,version_id:id(73),snapshot_hash:'a'.repeat(64),facts_hash:'b'.repeat(64),file_document_id:id(74),file_version_id:id(75),file_review_id:id(76)};
  await db.exec('RESET ROLE');await db.query('INSERT INTO fixture_programs VALUES($1,$2::jsonb)',[enrollment,JSON.stringify(programRef)]);await db.query('INSERT INTO program_fact_versions VALUES($1,$2::jsonb)',[id(73),JSON.stringify({full_title:'Подтверждённая программа'})]);await actAs();
  const prepared=(await mutate(scope,prepare)).state.draft;expect(prepared.status).toBe('prepared');expect(prepared.program_ref).toEqual(programRef);
  const exported=(await one('SELECT read_automatic_admission_draft($1,$2,$3) value',[org,enrollment,prepared.revision])).value;expect(exported.program_title).toBe('Подтверждённая программа');
  await db.exec('RESET ROLE');await db.query(`UPDATE fixture_programs SET program_ref=jsonb_set(program_ref,'{facts_hash}',to_jsonb($1::text))`,['c'.repeat(64)]);await actAs();
  expect((await read(scope)).draft.stale).toBe(true);await expect(db.query('SELECT read_automatic_admission_draft($1,$2,$3)',[org,enrollment,prepared.revision])).rejects.toThrow('SOURCE_CHANGED');
 });
 it('freezes registered rows and prior draft dates when applying new defaults',async()=>{
  const data={document_type:'enrollment_order',subject:{kind:'student',user_id:learner},context:{kind:'enrollment',enrollment_id:enrollment}};
  const binding={kind:'enrollment',organization_id:org,enrollment_id:enrollment,user_id:learner,course_id:course};
  await db.exec('RESET ROLE');await db.query(`INSERT INTO uc_document_registry_records VALUES($1,$2,$3,ARRAY[$3]::uuid[],ARRAY[$4]::uuid[],$5::jsonb,$6::jsonb,false)`,[id(60),org,group,learner,JSON.stringify(data),JSON.stringify(binding)]);
  const previousDraft=await one('SELECT to_jsonb(d) value FROM uc_automatic_admission_drafts d WHERE enrollment_id=$1',[enrollment]);const previousRegistry=await one('SELECT to_jsonb(r) value FROM uc_document_registry_records r');await actAs();
  await mutate(groupScope,save({document_date:'2025-01-01'}));await mutate(groupScope,{action:'apply_current',reason:'apply_to_pending',after_enrollment_id:null},1);
  await db.exec('RESET ROLE');expect(await one('SELECT to_jsonb(d) value FROM uc_automatic_admission_drafts d WHERE enrollment_id=$1',[enrollment])).toEqual(previousDraft);expect(await one('SELECT to_jsonb(r) value FROM uc_document_registry_records r')).toEqual(previousRegistry);
 });
 it('marks a revoked assignment as needing review and never substitutes its course-start timestamp',async()=>{
  await db.exec('RESET ROLE');await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,'2000-01-01','revoked',1)`,[id(44),learner,course]);await actAs();
  const state=await read({kind:'enrollment',enrollment_id:id(44),group_id:group});expect(state.draft.status).toBe('needs_information');expect(state.draft.missing_facts).toContain('enrollment_cancelled');expect(state.draft.document_date).not.toBe('2000-01-01');
 });
 it('preserves cross-organization library enrollment without creating a foreign admission project',async()=>{
  await db.exec('RESET ROLE');await db.query('INSERT INTO courses VALUES($1,$2,$3)',[id(25),otherOrg,'Общий библиотечный курс']);
  await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,NULL,'active',1)`,[id(44),learner,id(25)]);
  expect((await one('SELECT count(*) n FROM enrollments WHERE id=$1',[id(44)])).n).toBe(1);
  expect((await one('SELECT count(*) n FROM uc_automatic_admission_drafts WHERE enrollment_id=$1',[id(44)])).n).toBe(0);
 });
 it('does not expose internal helpers/tables to browser, anonymous or service callers',async()=>{
  await expect(db.query('SELECT uc_admission_draft_projection($1)',[enrollment])).rejects.toThrow('permission denied');
  await expect(db.query('SELECT * FROM uc_automatic_admission_drafts')).rejects.toThrow('permission denied');
  await actAs(owner,'anon');await expect(read(scope)).rejects.toThrow('permission denied');
  await actAs(owner,'service_role');await expect(read(scope)).rejects.toThrow('permission denied');
 });
 it('strict wire roundtrip accepts actual group null-date save, repeated no-op and independent date output',async()=>{
  const assertWire=(schema:typeof settingsSchema|typeof mutationSchema,raw:unknown)=>{
   const parsed=schema.safeParse(JSON.parse(JSON.stringify(raw)));
   const issues='error' in parsed ? parsed.error.issues.map(issue=>({path:issue.path,code:issue.code})) : [];
   expect(parsed.success,JSON.stringify(issues)).toBe(true);
  };
  assertWire(settingsSchema,await read(groupScope));
  const first=await mutate(groupScope,save({enabled:true}));assertWire(mutationSchema,first);
  const second=await mutate(groupScope,save({enabled:true}),1);assertWire(mutationSchema,second);
  expect(second.state.preferences).toEqual({enabled:true,document_date:null,effective_admission_date:null,timezone:null});expect(second.state.revision).toBe(1);
  const dated=await mutate(groupScope,save({enabled:true,document_date:'2026-11-18',effective_admission_date:'2026-11-17'}),1);assertWire(mutationSchema,dated);
  expect(dated.state.preferences).toMatchObject({document_date:'2026-11-18',effective_admission_date:'2026-11-17'});expect(dated.state.revision).toBe(2);
 });
});
