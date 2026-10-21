// Native-only product regressions. The entry/config and isolated cluster are root-owned.
import {expect} from 'vitest';
import {registerNativeCase, type NativeConnection, type NativeContext} from './group-education-native-harness';
import {groupEducationHistorySchema, groupRosterPageSchema} from '../../../src/lib/groupEducationFacts/contract';
import {educationArtifactDocumentSnapshot} from '../../functions/_shared/group-education-artifact';

const one = async (db:NativeConnection,sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
const state = async (c:NativeContext,group=c.ids.group) => (await c.read(c.b,{kind:'state'},group)).state;
const history = async (c:NativeContext,group=c.ids.group,after=0,ceiling:number|null=null,limit=50) => {
 const result=await c.read(c.b,{kind:'history',after_revision:after,ceiling_revision:ceiling,limit},group);
 groupEducationHistorySchema.parse(result);return result;
};
const roster = async (c:NativeContext,group=c.ids.group,at:any={kind:'current'},revision:number|null=null) => {
 const result=await c.roster(c.b,group,at,revision);groupRosterPageSchema.parse(result);return result;
};
const members = async (c:NativeContext,group=c.ids.group) => (await c.monitor.query('SELECT user_id FROM student_group_memberships_effective WHERE organization_id=$1 AND group_id=$2 ORDER BY user_id',[c.ids.organization,group])).rows.map(r=>r.user_id);
const add = (c:NativeContext,db:NativeConnection,users:string[],group=c.ids.group) => db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id) SELECT $1,$2,u FROM unnest($3::uuid[])u',[c.ids.organization,group,users]);
const remove = (c:NativeContext,db:NativeConnection,users:string[],group=c.ids.group) => db.query('DELETE FROM student_group_memberships WHERE organization_id=$1 AND group_id=$2 AND user_id=ANY($3::uuid[])',[c.ids.organization,group,users]);
const requests = async (c:NativeContext,db:NativeConnection,kind:string,group=c.ids.group) => (await db.query('SELECT id,row_kind,backend_pid,full_transaction_id,context,actor_ids,subject_ids,teacher_ids FROM uc_group_education_requests WHERE group_id=$1 AND row_kind=$2 ORDER BY created_at,id',[group,kind])).rows;
const snapshotRaw = async (c:NativeContext,id:string) => (await one(c.monitor,'SELECT to_jsonb(s)d FROM uc_group_roster_snapshots s WHERE id=$1',[id])).d;
const assertError = async (promise:Promise<unknown>,code:string,message:string) => {await expect(promise).rejects.toMatchObject({code,message:expect.stringContaining(message)});};
async function ownReadUnavailable(c:NativeContext) {
 await c.a.exec('SAVEPOINT native_own_read');await c.owner(c.a);
 await assertError(c.roster(c.a),'P0001','GROUP_FACTS_SOURCE_UNAVAILABLE');
 await c.a.exec('ROLLBACK TO SAVEPOINT native_own_read');await c.source(c.a);
}
async function base(c:NativeContext,calendar=false) {
 const initialized=await c.initialize();if(calendar)await c.publishCalendar();return initialized;
}
async function sourceTx(c:NativeContext,run:()=>Promise<void>) {
 await c.source(c.a);await c.a.exec('BEGIN');try{await run();await c.a.exec('COMMIT');}catch(e){await c.a.exec('ROLLBACK');throw e;}
}
async function freshGap(c:NativeContext,user:string,group=c.ids.group) {
 await sourceTx(c,async()=>{await add(c,c.a,[user],group);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await remove(c,c.a,[user],group);});
 const result=await state(c,group);expect(result.active_gap).not.toBeNull();return result;
}
const draftAction=(s:any)=>({action:'save_calendar_version',base_version_id:s.draft_calendar_id,expected_program_ref:s.program_ref,timezone:s.timezone,planned_start_date:'2026-10-19',planned_end_date:'2026-10-22',coverage:'whole_program',partial_reason:null,lessons:[],reason:'Synthetic native explicit empty draft'});
async function recoverAction(c:NativeContext,s:any,group=c.ids.group){const current=await c.read(c.b,{kind:'state'},group);expect(current.program_ref).not.toBeNull();return{action:'recover_coverage',gap_id:s.active_gap.id,expected_program_ref:current.program_ref,reason:'Synthetic native fresh observation after a known gap'};}
async function newBoundGroup(c:NativeContext,n:number) {
 const id=c.id(n);await c.source(c.monitor);await c.monitor.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic native group')",[id,c.ids.organization,c.ids.course]);await c.owner(c.monitor);await c.monitor.query('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)',[c.ids.organization,id,c.ids.course,c.s.programVersion.id,c.uuid()]);await c.source(c.monitor);return id;
}
async function erase(c:NativeContext,user:string,receipt:string) {
 await c.source(c.monitor);const files=(await one(c.monitor,'SELECT account_deletion_files($1)d',[user])).d;
 await c.monitor.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1) ON CONFLICT DO NOTHING',[user]);const job=c.uuid();
 await c.monitor.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,$2,'full-personal-data-v1','cleanup_pending',$3,'{}',$4,false)",[job,receipt,user,JSON.stringify(files)]);
 await c.caller(c.monitor,null,'service_role');
 for(const file of files)if(file.objectId)await c.monitor.query('DELETE FROM storage.objects WHERE id=$1',[file.objectId]);
 expect((await one(c.monitor,'SELECT account_deletion_erase_data($1,$2)d',[job,receipt])).d).toEqual({erased:true});await c.source(c.monitor);
}

registerNativeCase('N05','actual primary/additional union and reverse group transfers remain atomic under a competing capture',async c=>{
 await c.source(c.monitor);await c.monitor.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2',[c.ids.group,c.ids.student]);
 await base(c,true);await c.initialize(c.b,c.ids.otherGroup);const before=await history(c);const initialMembers=await members(c);
 await sourceTx(c,async()=>{await c.a.query('UPDATE profiles SET student_group_id=NULL WHERE user_id=$1',[c.ids.student]);});
 expect(await members(c)).toEqual(initialMembers);const afterPrimary=await history(c);
 expect(afterPrimary.events.filter((e:any)=>e.revision>before.current_revision&&e.action==='membership_observed'&&['join','leave'].includes(e.payload.change))).toEqual([]);
 await c.source(c.a);await c.a.exec('BEGIN');await remove(c,c.a,[c.ids.student]);
 const held=await c.locks([await c.a.pid()]);expect(held.some(l=>l.locktype==='advisory'&&l.granted)).toBe(true);await assertError(c.capture(c.b),'40001','GROUP_FACTS_SOURCE_CHANGED');
 await c.a.exec('COMMIT');await assertError(c.apply(c.b,afterPrimary.current_revision,draftAction((await state(c)))),'40001','GROUP_FACTS_REVISION_CONFLICT');
 expect((await roster(c)).rows).toHaveLength(0);expect((await history(c)).events.filter((e:any)=>e.action==='membership_observed'&&e.payload.change==='leave')).toHaveLength(1);
 await sourceTx(c,async()=>{await add(c,c.a,[c.ids.student],c.ids.otherGroup);await add(c,c.a,[c.ids.student]);});
 await sourceTx(c,async()=>{await remove(c,c.a,[c.ids.student],c.ids.otherGroup);await remove(c,c.a,[c.ids.student]);});
 expect(await members(c)).toEqual([]);expect(await members(c,c.ids.otherGroup)).toEqual([]);
 expect((await state(c)).active_gap).toBeNull();expect((await state(c,c.ids.otherGroup)).active_gap).toBeNull();
 c.note({initialMembers,afterPrimaryRevision:afterPrimary.current_revision,technicalEnrollments:(await c.monitor.query('SELECT id,user_id,course_id,status FROM enrollments WHERE user_id=$1',[c.ids.student])).rows,actualHeldSourceLocks:held});
});

registerNativeCase('N08','overbound recovery preserves the gap, then a bounded fresh NOW segment leaves earlier gap permanently unknown',async c=>{
 await base(c,true);const capture=await c.capture();const saved=await snapshotRaw(c,capture.receipt.snapshot_id);const users=await c.addStudents(1000,110000);
 await sourceTx(c,async()=>{await add(c,c.a,users);});let s=await state(c);expect(s.active_gap).not.toBeNull();const gap=structuredClone(s.active_gap);
 await assertError(c.apply(c.b,s.revision,await recoverAction(c,s)),'P0001','GROUP_FACTS_LIMIT_EXCEEDED');expect((await state(c)).active_gap).toEqual(gap);
 await sourceTx(c,async()=>{await remove(c,c.a,users);});s=await state(c);const recovered=await c.apply(c.b,s.revision,await recoverAction(c,s));expect(recovered.event.action).toBe('coverage_recovered');expect(recovered.envelope.state.coverage_segment_id).not.toBe(saved.coverage_segment_id);
 const unknown=await roster(c,c.ids.group,{kind:'at',at:gap.started_at,timezone:s.timezone});expect(unknown.coverage).toBe('unknown_gap');expect(unknown.count.exact_count).toBeNull();expect(unknown.rows).toEqual([]);
 expect((await roster(c)).rows.map((r:any)=>r.user_id)).toEqual([c.ids.student]);expect(await snapshotRaw(c,saved.id)).toEqual(saved);
 c.note({gap,recovery:recovered.receipt,oldSnapshotHash:saved.source_hash,coverageKnownFrom:recovered.envelope.state.coverage_known_from});
});

registerNativeCase('N12','enrollment and explicit UC111 association are prospectively known without inventing membership dates or changing old refs',async c=>{
 await base(c,true);const captured=await c.capture(),immutable=await snapshotRaw(c,captured.receipt.snapshot_id);const old=await roster(c),oldRef=(await state(c)).program_ref;const oldRow=structuredClone(old.rows[0]);
 await c.owner(c.a);await c.a.exec('BEGIN');const cancelled=(await one(c.a,'SELECT cancel_course_assignment($1,$2)d',[c.ids.enrollment,c.ids.organization])).d;expect(cancelled).toMatchObject({cancelled:true,enrollmentId:c.ids.enrollment});await c.a.exec('COMMIT');
 expect(await members(c)).toEqual([c.ids.student]);const missing=await roster(c);expect(missing.rows[0].association).toBe('no_exact_enrollment');expect(missing.rows[0].effective_from).toBe(oldRow.effective_from);
 const enrollment=c.uuid();await sourceTx(c,async()=>{await c.a.query("INSERT INTO enrollments(id,user_id,course_id,status)VALUES($1,$2,$3,'active')",[enrollment,c.ids.student,c.ids.course]);});
 await c.b.query('SELECT confirm_group_program_enrollments($1,$2,$3,$4,$5)',[c.ids.organization,c.ids.group,[enrollment],oldRef.binding_revision,c.uuid()]);
 const current=await roster(c);expect(current.rows[0].association).toBe('confirmed');expect(current.rows[0].enrollment_id).toBe(enrollment);expect(current.rows[0].effective_from).toBeNull();
 const past=await roster(c,c.ids.group,{kind:'at',at:old.as_of,timezone:old.timezone},old.knowledge_revision);expect(past.rows[0]).toEqual(oldRow);expect((await state(c)).program_ref).toEqual(oldRef);
 const events=(await history(c)).events;expect(events.filter((e:any)=>e.action==='association_observed').length).toBeGreaterThanOrEqual(2);expect(events.filter((e:any)=>e.action==='membership_observed'&&['join','leave'].includes(e.payload.change))).toEqual([]);
 await c.owner(c.a);expect((await one(c.a,'SELECT pg_current_xact_id_if_assigned() IS NULL no_xid')).no_xid).toBe(true);const samePidHistory=await c.read(c.a,{kind:'history',after_revision:0,ceiling_revision:null,limit:50});expect(samePidHistory.events.filter((e:any)=>e.action==='association_observed').map((e:any)=>e.id)).toEqual(events.filter((e:any)=>e.action==='association_observed').map((e:any)=>e.id));
 const other=await c.initialize(c.b,c.ids.otherGroup);const retainedOther=structuredClone(other.envelope.state.program_ref);const retainedBaseline=(await one(c.monitor,'SELECT source_snapshot FROM uc_group_education_events WHERE id=$1',[other.event.id])).source_snapshot;
 const head=(await one(c.monitor,'SELECT revision FROM program_fact_states WHERE program_id=$1',[c.ids.program])).revision;
 let next=(await one(c.b,'SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,$7,$8)d',[c.ids.organization,c.ids.program,'Synthetic116 next programme',c.s.file.version_id,c.ids.reviewer,JSON.stringify({...c.s.facts,full_title:'Synthetic116 next approved programme'}),head,c.uuid()])).d;
 next=(await one(c.b,"SELECT transition_program_facts_version($1,$2,'submit',NULL,$3)d",[next.id,next.revision,c.uuid()])).d;await c.caller(c.b,c.ids.reviewer);next=(await one(c.b,"SELECT transition_program_facts_version($1,$2,'approve',NULL,$3)d",[next.id,next.revision,c.uuid()])).d;await c.owner(c.b);
 const courseBinding=(await one(c.monitor,'SELECT revision FROM course_program_bindings WHERE course_id=$1',[c.ids.course])).revision;await c.b.query('SELECT bind_course_program_version($1,$2,$3,$4,$5)',[c.ids.organization,c.ids.course,next.id,courseBinding,c.uuid()]);
 await assertError(c.b.query('SELECT bind_group_program_version($1,$2,$3,$4,$5,$6)',[c.ids.organization,c.ids.group,c.ids.course,next.id,oldRef.binding_revision,c.uuid()]),'22023','group_program_binding_is_frozen');
 await c.b.query('SELECT bind_group_program_version($1,$2,$3,$4,$5,$6)',[c.ids.organization,c.ids.otherGroup,c.ids.course,next.id,retainedOther.binding_revision,c.uuid()]);const drift=await c.read(c.b,{kind:'state'},c.ids.otherGroup);
 expect(drift.state.program_ref).toEqual(retainedOther);expect(drift.program_ref.version_id).toBe(next.id);expect(drift.state.active_gap).not.toBeNull();expect(drift.prerequisites.some((p:any)=>p.code==='COVERAGE_GAP')).toBe(true);
 const recovered=await c.apply(c.b,drift.state.revision,await recoverAction(c,drift.state,c.ids.otherGroup),c.uuid(),c.ids.otherGroup);expect(recovered.envelope.state.program_ref).toEqual(drift.program_ref);expect(recovered.envelope.state.active_gap).toBeNull();expect((await one(c.monitor,'SELECT source_snapshot FROM uc_group_education_events WHERE id=$1',[other.event.id])).source_snapshot).toEqual(retainedBaseline);expect(await snapshotRaw(c,immutable.id)).toEqual(immutable);expect((await state(c)).program_ref).toEqual(oldRef);
 c.note({oldKnowledge:old.knowledge_revision,currentKnowledge:current.knowledge_revision,oldEnrollment:oldRow.enrollment_id,newEnrollment:enrollment,associationEvents:events.filter((e:any)=>e.action==='association_observed').map((e:any)=>({id:e.id,revision:e.revision,payload:e.payload}))});
});

registerNativeCase('N15','display rename is not a source-date observer, former labels stay retained and current teacher eligibility is rechecked',async c=>{
 await base(c,true);const captured=await c.capture();const immutable=await snapshotRaw(c,captured.receipt.snapshot_id);const before=await state(c);
 await c.source(c.monitor);await c.monitor.query("UPDATE profiles SET full_name='Synthetic renamed current display'WHERE user_id=$1",[c.ids.student]);
 expect((await state(c)).revision).toBe(before.revision);expect((await roster(c)).rows[0].subject_label).toBe('Synthetic116 Learner');expect(await snapshotRaw(c,immutable.id)).toEqual(immutable);
 await sourceTx(c,async()=>{await remove(c,c.a,[c.ids.student]);});
 const past=await roster(c,c.ids.group,{kind:'at',at:immutable.as_of,timezone:immutable.timezone},immutable.knowledge_revision);expect(past.rows[0].subject_label).toBe('Synthetic116 Learner');expect(past.rows[0].label_observed_at).not.toBeNull();expect(past.rows[0].label_source).not.toBeNull();
 await c.monitor.query("UPDATE org_staff SET expires_at=clock_timestamp()-interval'1 second'WHERE user_id=$1",[c.ids.teacher]);
 await assertError(c.capture(c.b),'P0001','GROUP_FACTS_PREREQUISITE_MISSING');
 await c.monitor.query("UPDATE student_groups SET schedule_text='Synthetic legacy edit'WHERE id=$1",[c.ids.group]);
 const drift=await state(c);expect(drift.legacy_calendar_changed).toBe(true);expect(drift.prerequisites.some((p:any)=>p.code==='LEGACY_SOURCE_CHANGED')).toBe(true);expect(await snapshotRaw(c,immutable.id)).toEqual(immutable);
 c.note({labelObservedAt:past.rows[0].label_observed_at,retainedLabel:past.rows[0].subject_label,legacyChangedRevision:drift.revision,oldSourceHash:immutable.source_hash});
});

registerNativeCase('N17','one deferred final fold reduces join→leave and redundant edges without ghost membership or ownTX authority',async c=>{
 await base(c,true);const before=await roster(c),s=await state(c);const [user]=await c.addStudents(1,120000);
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);await remove(c,c.a,[user]);await ownReadUnavailable(c);
 expect((await roster(c)).rows).toEqual(before.rows);const held=await c.locks([await c.a.pid()]);expect(held.some(l=>l.locktype==='advisory'&&l.granted)).toBe(true);await assertError(c.capture(c.b),'40001','GROUP_FACTS_SOURCE_CHANGED');await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await ownReadUnavailable(c);
 const receipt=await requests(c,c.a,'source_transaction_receipt');expect(receipt).toHaveLength(1);expect(receipt[0].context.status).toBe('first_flush_complete_provisional');
 await c.a.exec('COMMIT');const captured=await c.capture(c.b);expect(captured.event.action).toBe('roster_captured');const after=await roster(c);expect(after.rows.map((r:any)=>r.user_id)).toEqual(before.rows.map((r:any)=>r.user_id));expect(after.coverage).toBe('complete_observed');
 expect((await history(c)).events.filter((e:any)=>e.revision>s.revision&&e.action==='membership_observed'&&e.subject_user_id===user&&['join','leave'].includes(e.payload.change))).toEqual([]);
 c.note({receipt:receipt[0],actualHeldSourceLocks:held,technicalEnrollments:(await c.monitor.query('SELECT id,user_id,course_id,status FROM enrollments WHERE user_id=ANY($1::uuid[])',[[user,c.ids.student]])).rows});
});

registerNativeCase('N18','early flush receipt invalidates every ownTX provisional event and old history ceiling cannot conceal a fresh gap',async c=>{
 await base(c,true);const captured=await c.capture(),immutable=await snapshotRaw(c,captured.receipt.snapshot_id),before=await state(c);const [user]=await c.addStudents(1,121000);
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');const receipt=(await requests(c,c.a,'source_transaction_receipt'))[0];expect(receipt.context.status).toBe('first_flush_complete_provisional');const provisional=(await c.a.query('SELECT id,revision FROM uc_group_education_events WHERE source_receipt_id=$1',[receipt.id])).rows;expect(provisional.length).toBeGreaterThan(0);
 expect((await roster(c)).rows.map((r:any)=>r.user_id)).toEqual([c.ids.student]);await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await remove(c,c.a,[user]);await ownReadUnavailable(c);await c.a.exec('COMMIT');
 const current=await state(c);expect(current.coverage).toBe('unknown_gap');expect(current.active_gap.last_complete_revision).toBe(before.revision);const all=await history(c);expect(all.events.some((e:any)=>provisional.some(p=>p.id===e.id))).toBe(false);
 const pinned=await history(c,c.ids.group,0,before.revision,1);expect(pinned.ceiling_revision).toBe(before.revision);expect(pinned.current_coverage).toBe('unknown_gap');
 if(pinned.next_after_revision!==null){const next=await history(c,c.ids.group,pinned.next_after_revision,pinned.ceiling_revision,1);expect(next.ceiling_revision).toBe(pinned.ceiling_revision);expect(next.events.every((e:any)=>e.revision>pinned.next_after_revision&&e.revision<=pinned.ceiling_revision)).toBe(true);}
 const firstPage=await history(c,c.ids.group,0,null,1);expect(firstPage.ceiling_revision).toBe(current.revision);expect(firstPage.next_after_revision).not.toBeNull();expect(firstPage.current_coverage).toBe('unknown_gap');
 const envelope=await c.read(c.b);expect(envelope.program_ref).not.toBeNull();await c.owner(c.a);await c.a.exec('BEGIN');const appended=await c.apply(c.a,current.revision,{...draftAction(current),expected_program_ref:envelope.program_ref});await c.a.exec('COMMIT');expect(appended.event.action).toBe('calendar_saved');expect(appended.event.revision).toBeGreaterThan(firstPage.ceiling_revision);
 const secondPage=await history(c,c.ids.group,firstPage.next_after_revision,firstPage.ceiling_revision,1);expect(secondPage.ceiling_revision).toBe(firstPage.ceiling_revision);expect(secondPage.current_revision).toBe(appended.receipt.revision_applied);expect(secondPage.current_revision).toBeGreaterThan(firstPage.current_revision);expect(secondPage.current_coverage).toBe('unknown_gap');expect(secondPage.active_gap).toEqual(current.active_gap);expect(secondPage.events.length).toBeGreaterThan(0);expect(secondPage.events.every((e:any)=>e.revision>firstPage.next_after_revision&&e.revision<=firstPage.ceiling_revision)).toBe(true);expect(secondPage.events.some((e:any)=>e.id===appended.event.id)).toBe(false);expect((await history(c)).events.some((e:any)=>e.id===appended.event.id)).toBe(true);
 const oldCutoff=await roster(c,c.ids.group,{kind:'at',at:receipt.context.first_observed_at,timezone:current.timezone},before.revision);expect(oldCutoff.coverage).toBe('unknown_gap');expect(oldCutoff.rows).toEqual([]);expect(await snapshotRaw(c,immutable.id)).toEqual(immutable);
 c.note({receipt:receipt.id,provisionalRevisions:provisional.map(p=>p.revision),gap:current.active_gap,historyRevisions:all.events.map((e:any)=>e.revision),pinnedCeiling:pinned.ceiling_revision,paginatedCeiling:firstPage.ceiling_revision,appendedAfterFirstPage:{id:appended.event.id,revision:appended.event.revision},secondPageRevisions:secondPage.events.map((e:any)=>e.revision)});
});

registerNativeCase('N19','IMMEDIATE constraints distinguish later source statements from multiple rows in one statement',async c=>{
 await base(c,true);const users=await c.addStudents(4,122000);
 await sourceTx(c,async()=>{await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await add(c,c.a,users.slice(0,2));});expect((await state(c)).active_gap).toBeNull();expect((await roster(c)).count.exact_count).toBe(3);
 await c.source(c.a);await c.a.exec('BEGIN');await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await add(c,c.a,[users[2]]);const ownTx=(await one(c.a,'SELECT pg_current_xact_id()::text tx')).tx;const first=(await requests(c,c.a,'source_transaction_receipt')).find(r=>r.full_transaction_id===ownTx);expect(first.context.status).toBe('first_flush_complete_provisional');expect((await c.locks([await c.a.pid()])).some(l=>l.locktype==='advisory'&&l.granted)).toBe(true);await assertError(c.capture(c.b),'40001','GROUP_FACTS_SOURCE_CHANGED');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await add(c,c.a,[users[3]]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.exec('COMMIT');await assertError(c.capture(c.b),'P0001','GROUP_FACTS_COVERAGE_GAP');
 const s=await state(c);expect(s.active_gap).not.toBeNull();expect((await roster(c)).coverage).toBe('unknown_gap');expect(await members(c)).toHaveLength(5);c.note({gap:s.active_gap,actualMembers:await members(c)});
});

registerNativeCase('N20','callbacks, watched-column no-ops and unrelated renames do not fabricate a new observation',async c=>{
 await base(c);const [user]=await c.addStudents(1,123000);
 const ownStage=async()=>(await c.a.query("SELECT request_id FROM uc_group_education_requests WHERE row_kind='source_detail'AND group_id=$1 AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text",[c.ids.group])).rows;
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);await remove(c,c.a,[user]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');const first=(await requests(c,c.a,'source_transaction_receipt'))[0];const counter=first.context.source_observation_counter;expect(Number.isSafeInteger(counter)).toBe(true);expect(counter).toBeGreaterThan(0);expect(first.context.first_flushed_observation_counter).toBe(counter);expect(await ownStage()).toEqual([]);
 await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.query('UPDATE profiles SET student_group_id=student_group_id WHERE user_id=$1',[c.ids.student]);await c.a.query("UPDATE profiles SET full_name='Synthetic unrelated renamed display'WHERE user_id=$1",[user]);
 const stable=(await requests(c,c.a,'source_transaction_receipt'))[0];expect(stable.context.source_observation_counter).toBe(counter);expect(stable.context.status).toBe('first_flush_complete_provisional');expect(await ownStage()).toEqual([]);await c.a.exec('COMMIT');expect((await state(c)).active_gap).toBeNull();
 let lastSourceTransaction:string|null=null;
 await sourceTx(c,async()=>{await c.a.query('UPDATE profiles SET student_group_id=$1 WHERE user_id=$2',[c.ids.group,c.ids.student]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');const tx=(await one(c.a,'SELECT pg_current_xact_id()::text tx')).tx,prior=(await requests(c,c.a,'source_transaction_receipt')).find(r=>r.full_transaction_id===tx);lastSourceTransaction=tx;expect(Number.isSafeInteger(prior.context.source_observation_counter)).toBe(true);await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await c.a.query('UPDATE profiles SET archived_at=clock_timestamp()WHERE user_id=$1',[c.ids.student]);const changed=(await requests(c,c.a,'source_transaction_receipt')).find(r=>r.full_transaction_id===tx);expect(changed.context.source_observation_counter).toBeGreaterThan(prior.context.source_observation_counter);expect(changed.context.status).toBe('gap');});
 expect(lastSourceTransaction).not.toBeNull();expect((await c.monitor.query("SELECT request_id FROM uc_group_education_requests WHERE row_kind='source_detail'AND group_id=$1 AND backend_pid=$2 AND full_transaction_id=$3",[c.ids.group,await c.a.pid(),lastSourceTransaction])).rows).toEqual([]);
 expect((await state(c)).active_gap).not.toBeNull();c.note({counter,stableStatus:stable.context.status,unionBeforeAndAfterPrimary:await members(c),gap:(await state(c)).active_gap});
});

registerNativeCase('N21','all mixed initialized source/public orders reject, including persisted artifacts, flush, replay and recover; savepoint rollback is real',async c=>{
 await base(c,true);const retained=await c.capture(),retainedRaw=await snapshotRaw(c,retained.receipt.snapshot_id),page=await c.read(c.b,{kind:'snapshot',snapshot_id:retained.receipt.snapshot_id,after_user_id:null,limit:100});expect(page.next_after_user_id).toBeNull();expect(page.rows).toHaveLength(page.header.row_count);expect(page.artifact_projection).not.toBeNull();
 const h=page.header,source={schema_version:1 as const,snapshot_id:h.id,source_hash:h.source_hash,roster_hash:h.roster_hash,calendar_version_id:h.calendar_version_id,calendar_hash:h.calendar_hash,as_of:h.as_of,timezone:h.timezone,knowledge_revision:h.knowledge_revision,coverage_segment_id:h.coverage_segment_id};const canonical=educationArtifactDocumentSnapshot({header:h,rows:page.rows,projection:page.artifact_projection,source});
 const artifact=[{doc_type:'student_list',name:'Synthetic native retained draft',doc_status:'draft',document_number:null,layout_format:'legacy_html',variables:{program_title:c.s.facts.full_title,program_hours:String(c.s.facts.academic_hours),program_form:'Заочная'},variables_snapshot:canonical}];const persist=(db:NativeConnection)=>db.query('SELECT * FROM create_group_document_batch($1,$2,$3)',[c.ids.organization,c.ids.group,JSON.stringify(artifact)]);const documentRows=()=>c.monitor.query('SELECT to_jsonb(d)row FROM group_documents d WHERE organization_id=$1 AND group_id=$2 ORDER BY id',[c.ids.organization,c.ids.group]);const priorDocuments=(await documentRows()).rows;
 const [user]=await c.addStudents(1,124000);let s=await state(c);const replayRequest=c.uuid(),replayAction=draftAction(s),replayExpected=s.revision;await c.apply(c.b,replayExpected,replayAction,replayRequest);s=await state(c);
 for(const flushed of[false,true]){await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);if(flushed)await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.owner(c.a);await assertError(c.apply(c.a,s.revision,draftAction(s)),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');expect((await state(c)).revision).toBe(s.revision);}
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.owner(c.a);await assertError(c.apply(c.a,replayExpected,replayAction,replayRequest),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');
 await c.owner(c.a);await c.a.exec('BEGIN');await c.apply(c.a,s.revision,draftAction(s));await c.source(c.a);await assertError(add(c,c.a,[user]),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');expect((await state(c)).revision).toBe(s.revision);
 await c.owner(c.a);await c.a.exec('BEGIN');const kept=await c.apply(c.a,s.revision,draftAction(s));await c.a.exec('SAVEPOINT catch_source');await c.source(c.a);await assertError(add(c,c.a,[user]),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK TO SAVEPOINT catch_source');await c.a.exec('COMMIT');expect((await state(c)).revision).toBe(kept.receipt.revision_applied);expect(await members(c)).toEqual([c.ids.student]);
 for(const flushed of[false,true]){await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);if(flushed)await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.owner(c.a);await assertError(persist(c.a),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');expect((await documentRows()).rows).toEqual(priorDocuments);expect(await snapshotRaw(c,retainedRaw.id)).toEqual(retainedRaw);}
 await c.owner(c.a);await c.a.exec('BEGIN');const staged=await persist(c.a);expect(staged.rows).toHaveLength(1);expect(staged.rows[0].inserted_count).toBe(1);expect((await one(c.a,'SELECT count(*)::int n FROM group_documents WHERE package_batch_id=$1',[staged.rows[0].batch_id])).n).toBe(1);await c.source(c.a);await assertError(add(c,c.a,[user]),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');expect((await documentRows()).rows).toEqual(priorDocuments);expect(await snapshotRaw(c,retainedRaw.id)).toEqual(retainedRaw);expect(await members(c)).toEqual([c.ids.student]);
 s=await freshGap(c,user);await c.owner(c.a);await c.a.exec('BEGIN');await c.apply(c.a,s.revision,await recoverAction(c,s));await c.source(c.a);await assertError(add(c,c.a,[user]),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');expect((await state(c)).active_gap.id).toBe(s.active_gap.id);
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);await c.owner(c.a);await assertError(c.apply(c.a,s.revision,await recoverAction(c,s)),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK');
 c.note({replayRequest,keptPublicRevision:kept.receipt.revision_applied,gap:s.active_gap,canonicalArtifact:{snapshot_id:retainedRaw.id,stagedBatch:staged.rows[0],committedDocumentsUnchanged:true,sourceBeforePersistIncludingFlushRejected:true,persistBeforeSourceRolledBack:true},commandRows:(await c.monitor.query("SELECT request_id,action,expected_revision FROM uc_group_education_requests WHERE row_kind='command'AND group_id=$1 ORDER BY created_at",[c.ids.group])).rows});
});

registerNativeCase('N22','uninitialized earlier INSERT and DELETE are absorbed by NOW baseline, while initialize→source is forbidden',async c=>{
 // Integration amendment: original frozen N22 failed because ROLLBACK TO
 // restores authenticated, whose direct private-table access must stay denied.
 // Only this diagnostic observation uses the SQL owner, on the same backend/tx.
 const diagnosticIdentity=()=>one(c.a,"SELECT current_user sql_role,session_user login_role,current_setting('role')role_setting,current_setting('request.jwt.claim.sub',true)jwt_sub,current_setting('request.jwt.claim.role',true)jwt_role,pg_backend_pid()pid,pg_current_xact_id_if_assigned()::text full_transaction_id");
 const diagnosticAcl=()=>one(c.a,"SELECT pg_get_userbyid(relowner)owner,relacl::text acl,relrowsecurity,has_table_privilege('authenticated',oid,'SELECT')authenticated_select FROM pg_class WHERE oid='public.uc_group_education_requests'::regclass");
 const initializedDetailsAsSqlOwner=async()=>{
  const before=await diagnosticIdentity(),aclBefore=await diagnosticAcl();
  expect(before.sql_role).toBe('authenticated');expect(before.login_role).toBe('postgres');expect(before.role_setting).toBe('authenticated');
  expect(before.jwt_sub).toBe(c.ids.owner);expect(before.jwt_role).toBe('authenticated');expect(before.pid).toBe(await c.a.pid());expect(before.full_transaction_id).toMatch(/^[1-9][0-9]{0,19}$/);
  expect(aclBefore.owner).toBe('postgres');expect(aclBefore.authenticated_select).toBe(false);expect(aclBefore.relrowsecurity).toBe(true);
  let denied:any=null;
  await c.a.exec('SAVEPOINT n22_authenticated_private_read');
  try{await requests(c,c.a,'source_detail');}
  catch(error:any){denied={code:error.code??null,message:String(error.message),detail:error.detail??null,where:error.where??null};}
  finally{await c.a.exec('ROLLBACK TO SAVEPOINT n22_authenticated_private_read');await c.a.exec('RELEASE SAVEPOINT n22_authenticated_private_read');}
  const afterDenied=await diagnosticIdentity();
  c.note({diagnosticAmendment:'N22 authenticated private-table denial',before,afterDenied,denied});
  expect(denied).toMatchObject({code:'42501',message:expect.stringContaining('permission denied for table uc_group_education_requests')});expect(afterDenied).toEqual(before);
  let inside:any=null,details:any[]|null=null,diagnosticError:any=null;
  await c.a.exec('SAVEPOINT n22_diagnostic_owner_read');
  try{
   await c.a.exec('RESET ROLE');inside=await diagnosticIdentity();expect(inside.sql_role).toBe('postgres');
   for(const key of['login_role','jwt_sub','jwt_role','pid','full_transaction_id'])expect(inside[key]).toEqual(before[key]);
   details=await requests(c,c.a,'source_detail');expect(details).toEqual([]);
  }catch(error:any){diagnosticError={code:error.code??null,message:String(error.message)};throw error;}
  finally{
   await c.a.exec('ROLLBACK TO SAVEPOINT n22_diagnostic_owner_read');await c.a.exec('RELEASE SAVEPOINT n22_diagnostic_owner_read');
   const after=await diagnosticIdentity(),aclAfter=await diagnosticAcl();
   c.note({diagnosticAmendment:'N22 same-backend SQL-owner observation only; original business calls keep authenticated scope',before,inside,after,aclBefore,aclAfter,diagnosticError,detailCount:details?.length??null});
   expect(after).toEqual(before);expect(aclAfter).toEqual(aclBefore);
  }
  return details;
 };
 const [user]=await c.addStudents(1,125000);await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[user]);expect(await requests(c,c.a,'source_pending')).toEqual([]);expect(await requests(c,c.a,'source_detail')).toEqual([]);expect(await requests(c,c.a,'public_operation')).toEqual([]);await c.owner(c.a);const initialized=await c.initialize(c.a);expect(initialized.event.payload.baseline_present_count).toBe(2);expect(initialized.event.payload.coverage_known_from).toBe(initialized.envelope.state.coverage_known_from);
 await c.a.exec('SAVEPOINT after_initialize');await c.source(c.a);await assertError(remove(c,c.a,[user]),'25000','GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED');await c.a.exec('ROLLBACK TO SAVEPOINT after_initialize');expect(await initializedDetailsAsSqlOwner()).toEqual([]);await c.a.exec('COMMIT');expect((await roster(c)).rows.every((r:any)=>r.effective_from===null)).toBe(true);
 await c.source(c.monitor);await add(c,c.monitor,[c.ids.student],c.ids.otherGroup);await c.source(c.a);await c.a.exec('BEGIN');await remove(c,c.a,[c.ids.student],c.ids.otherGroup);expect(await requests(c,c.a,'source_pending',c.ids.otherGroup)).toEqual([]);expect(await requests(c,c.a,'source_detail',c.ids.otherGroup)).toEqual([]);await c.owner(c.a);const deleted=await c.initialize(c.a,c.ids.otherGroup);expect(deleted.event.payload.baseline_present_count).toBe(0);await c.a.exec('COMMIT');expect((await roster(c,c.ids.otherGroup)).count.exact_count).toBe(0);
 c.note({insertBaseline:initialized.receipt,deleteBaseline:deleted.receipt,legalDateClaim:'none: effective_from remains null; coverage begins at server-observed initialization'});
});

registerNativeCase('N23','rollback of later invalidation and rollback of first flush restore the real queue and receipt atomically',async c=>{
 await base(c,true);const captured=await c.capture(),immutable=await snapshotRaw(c,captured.receipt.snapshot_id),users=await c.addStudents(2,126000);
 const ownRequests=async()=>(await c.a.query('SELECT to_jsonb(r)row FROM uc_group_education_requests r WHERE backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text ORDER BY row_kind,request_id NULLS FIRST,id')).rows.map(r=>r.row);
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[users[0]]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');const receipt=(await requests(c,c.a,'source_transaction_receipt'))[0];await c.a.exec('SAVEPOINT before_later_source');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await remove(c,c.a,[users[0]]);expect((await one(c.a,'SELECT active_gap FROM uc_group_education_states WHERE group_id=$1',[c.ids.group])).active_gap).not.toBeNull();await c.a.exec('ROLLBACK TO SAVEPOINT before_later_source');expect((await requests(c,c.a,'source_transaction_receipt'))[0].context.status).toBe('first_flush_complete_provisional');await c.a.exec('COMMIT');expect((await state(c)).active_gap).toBeNull();
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[users[1]]);
 const beforeTx=(await one(c.a,'SELECT pg_current_xact_id()::text tx')).tx,pendingReceipts=(await requests(c,c.a,'source_transaction_receipt')).filter(r=>r.full_transaction_id===beforeTx);expect(pendingReceipts).toHaveLength(1);const pendingReceipt=structuredClone(pendingReceipts[0]),counter=pendingReceipt.context.source_observation_counter;
 expect(pendingReceipt.context.status).toBe('pending');expect(Number.isSafeInteger(counter)).toBe(true);expect(counter).toBeGreaterThan(0);expect(pendingReceipt.context.first_flushed_observation_counter).toBeNull();expect(pendingReceipt.context.first_flush_event_revision_range).toBeNull();expect(pendingReceipt.context.gap_id).toBeNull();
 const pendingQueue=await requests(c,c.a,'source_pending'),beforeFlushState=(await one(c.a,'SELECT to_jsonb(s)d FROM uc_group_education_states s WHERE group_id=$1',[c.ids.group])).d;expect(pendingQueue).toHaveLength(1);expect(beforeFlushState.active_gap).toBeNull();expect((await c.a.query('SELECT id,revision FROM uc_group_education_events WHERE source_receipt_id=$1',[pendingReceipt.id])).rows).toEqual([]);
 const pendingPrivateRows=structuredClone(await ownRequests()),pendingDetails=pendingPrivateRows.filter(r=>r.row_kind==='source_detail'),pendingBudget=pendingPrivateRows.filter(r=>r.row_kind==='source_transaction_budget');expect(pendingDetails).toHaveLength(1);expect(pendingDetails[0]).toMatchObject({row_kind:'source_detail',request_id:users[1],organization_id:c.ids.organization,group_id:c.ids.group,course_id:c.ids.course,backend_pid:await c.a.pid(),full_transaction_id:beforeTx,actor_ids:[],subject_ids:[users[1]],teacher_ids:[],context:{schema_version:1,subject_user_id:users[1]}});expect(Object.keys(pendingDetails[0].context.detail).sort()).toEqual(['association_source','first_before','last_contributor_index','membership_source']);expect(pendingBudget).toHaveLength(1);expect(Number.isSafeInteger(pendingBudget[0].context.admitted_detail_count)).toBe(true);expect(pendingBudget[0].context.admitted_detail_count).toBeGreaterThan(0);
 await c.a.exec('SAVEPOINT before_first_flush');await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');const flushedReceipts=await requests(c,c.a,'source_transaction_receipt');expect(flushedReceipts.some(r=>r.full_transaction_id!==receipt.full_transaction_id)).toBe(true);const flushed=flushedReceipts.filter(r=>r.full_transaction_id===beforeTx);expect(flushed).toHaveLength(1);expect(flushed[0].id).toBe(pendingReceipt.id);expect(flushed[0].context.status).toBe('first_flush_complete_provisional');expect(flushed[0].context.source_observation_counter).toBe(counter);expect(flushed[0].context.first_flushed_observation_counter).toBe(counter);expect((await c.a.query('SELECT id,revision FROM uc_group_education_events WHERE source_receipt_id=$1',[pendingReceipt.id])).rows.length).toBeGreaterThan(0);
 const flushedPrivateRows=await ownRequests();expect(flushedPrivateRows.filter(r=>r.row_kind==='source_detail')).toEqual([]);expect(flushedPrivateRows.filter(r=>r.row_kind==='source_transaction_budget')).toEqual(pendingBudget);
 await c.a.exec('ROLLBACK TO SAVEPOINT before_first_flush');const own=(await one(c.a,'SELECT pg_current_xact_id()::text tx')).tx;expect(own).toBe(beforeTx);const restored=(await requests(c,c.a,'source_transaction_receipt')).filter(r=>r.full_transaction_id===own);expect(restored).toEqual([pendingReceipt]);expect(restored[0].context.first_flushed_observation_counter).toBeNull();expect(restored[0].context.first_flush_event_revision_range).toBeNull();expect(restored[0].context.gap_id).toBeNull();expect(await requests(c,c.a,'source_pending')).toEqual(pendingQueue);expect(await ownRequests()).toEqual(pendingPrivateRows);expect((await one(c.a,'SELECT to_jsonb(s)d FROM uc_group_education_states s WHERE group_id=$1',[c.ids.group])).d).toEqual(beforeFlushState);expect((await c.a.query('SELECT id,revision FROM uc_group_education_events WHERE source_receipt_id=$1',[pendingReceipt.id])).rows).toEqual([]);expect((await requests(c,c.a,'source_pending')).length).toBeGreaterThan(0);await remove(c,c.a,[users[1]]);await c.a.exec('COMMIT');
 expect((await state(c)).active_gap).toBeNull();expect((await roster(c)).rows.map((r:any)=>r.user_id).sort()).toEqual([c.ids.student,users[0]].sort());expect(await snapshotRaw(c,immutable.id)).toEqual(immutable);c.note({firstReceipt:receipt.id,secondFullTransaction:own,restoredPendingReceipt:pendingReceipt,restoredPendingCounter:counter,restoredSourceDetails:pendingDetails,restoredBudget:pendingBudget,provisionalFlushRolledBack:true,oldSnapshotHash:immutable.source_hash,locks:await c.locks()});
});

registerNativeCase('N24','durable wrong-PID/TX witnesses and spoofed GUC grant no authority; real serviceNULL source remains honest',async c=>{
 await base(c);const [user]=await c.addStudents(1,127000),pid=await c.a.pid();await c.source(c.monitor);
 await c.monitor.query("INSERT INTO uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context)VALUES('public_operation',$1,$2,$3,$4,'0','{\"first_observed_at\":\"2026-10-19T00:00:00Z\"}'),('source_transaction_receipt',$1,$2,$3,$4,'0','{\"status\":\"first_flush_complete_provisional\"}')",[c.ids.organization,c.ids.group,c.ids.course,pid]);
 for(const role of['authenticated','service_role','anon']){await c.caller(c.a,role==='authenticated'?c.ids.owner:null,role);await c.a.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,false)",[c.ids.student]);await assertError(c.a.query("INSERT INTO uc_group_education_requests(row_kind,backend_pid,full_transaction_id,context)VALUES('public_operation',pg_backend_pid(),pg_current_xact_id()::text,'{}')"),'42501','permission denied');await assertError(c.a.query('SELECT uc_erase_group_education_facts($1)',[c.ids.student]),'42501','permission denied');}
 await sourceTx(c,async()=>{await add(c,c.a,[user]);});expect((await state(c)).active_gap).toBeNull();expect((await roster(c)).rows.some((r:any)=>r.user_id===user)).toBe(true);
 const events=(await c.monitor.query("SELECT actor_id,origin FROM uc_group_education_events WHERE subject_user_id=$1 AND action IN('membership_observed','association_observed')",[user])).rows;expect(events.length).toBeGreaterThan(0);expect(events.every(e=>e.actor_id===null&&e.origin==='service')).toBe(true);
 await c.source(c.monitor);await c.monitor.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[c.ids.owner]);await assertError(c.read(c.b),'42501','GROUP_FACTS_ACCESS_DENIED');c.note({spoofedPid:pid,staleTransaction:'0',actualServiceEvents:events});
});

registerNativeCase('N25','10001 admitted source contexts gap only incomplete A/C while B and eight complete groups remain exact',async c=>{
 await base(c);const groups:string[]=[];for(let i=0;i<10;i++){const group=await newBoundGroup(c,200000+i);await c.initialize(c.b,group);groups.push(group);}const fillers=groups.slice(0,8),b=groups[8],last=groups[9];const users=await c.addStudents(1000,130000);
 await c.source(c.a);await c.a.exec('BEGIN');await add(c,c.a,[users[0]]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await remove(c,c.a,[users[0]]);
 for(const group of [...fillers].reverse())await add(c,c.a,users,group);await add(c,c.a,users,b);await add(c,c.a,users,last);
 const budget=(await c.a.query("SELECT context FROM uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text")).rows;expect(budget).toHaveLength(1);expect(Number.isSafeInteger(budget[0].context.admitted_detail_count)).toBe(true);expect(budget[0].context.admitted_detail_count).toBe(10000);
 expect((await roster(c,b)).count.exact_count).toBe(0);await c.a.exec('COMMIT');
 expect((await state(c)).active_gap).not.toBeNull();expect((await state(c,last)).active_gap).not.toBeNull();expect((await roster(c,last)).count.exact_count).toBeNull();
 for(const group of[...fillers,b]){const s=await state(c,group);expect(s.active_gap).toBeNull();expect(s.membership_count.exact_count).toBe(1000);expect((await members(c,group)).length).toBe(1000);}
 expect((await members(c,last)).length).toBe(1000);c.note({budget,completeGroups:[...fillers,b],gapGroups:[c.ids.group,last],uniqueChangedGroupSubjects:10001,locks:await c.locks()});
});

registerNativeCase('N26','validated reviewer/subject erase inventories and redacts durable receipts and invalidated source events without resurrection',async c=>{
 await base(c,true);const captured=await c.capture(),snapshot=captured.receipt.snapshot_id;const [user]=await c.addStudents(1,140000);
 await c.source(c.a);await c.a.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[c.ids.writer]);await c.a.exec('BEGIN');await add(c,c.a,[user]);await c.a.exec('SET CONSTRAINTS ALL IMMEDIATE');await c.a.exec('SET CONSTRAINTS ALL DEFERRED');await remove(c,c.a,[user]);await c.a.exec('COMMIT');
 await c.caller(c.a,c.ids.writer);const s=await c.read(c.a);await c.apply(c.a,s.state.revision,draftAction(s.state));
 const before=JSON.stringify((await c.monitor.query('SELECT to_jsonb(r)d FROM uc_group_education_requests r')).rows);expect(before).toContain(c.ids.writer);await erase(c,c.ids.writer,'synthetic116-reviewer');
 for(const table of['uc_group_education_requests','uc_group_education_events','uc_group_education_states','uc_group_calendar_versions','uc_group_roster_snapshots']){const raw=JSON.stringify((await c.monitor.query('SELECT to_jsonb(t)d FROM '+table+' t')).rows);expect(raw,table).not.toContain(c.ids.writer);}
 await erase(c,c.ids.student,'synthetic116-subject');
 for(const table of['uc_group_education_requests','uc_group_education_events','uc_group_education_states','uc_group_calendar_versions','uc_group_roster_snapshots']){const raw=JSON.stringify((await c.monitor.query('SELECT to_jsonb(t)d FROM '+table+' t')).rows);expect(raw,table).not.toContain(c.ids.student);expect(raw,table).not.toContain('Synthetic116 Learner');}
 const unavailable=await c.read(c.b,{kind:'snapshot',snapshot_id:snapshot,after_user_id:null,limit:100});expect(unavailable.header.available).toBe(false);expect(unavailable.rows).toEqual([]);expect(unavailable.artifact_projection).toBeNull();
 expect((await c.monitor.query("SELECT row_kind FROM uc_group_education_requests WHERE row_kind IN('source_pending','source_detail','source_parent','erase_context')")).rows).toEqual([]);c.note({snapshot,unavailable:unavailable.header.prerequisites,durableKinds:(await c.monitor.query('SELECT row_kind,count(*)::int n FROM uc_group_education_requests GROUP BY row_kind ORDER BY row_kind')).rows,oldAdmissionRows:(await one(c.monitor,'SELECT count(*)::int n FROM uc_admission_cases')).n});
});
