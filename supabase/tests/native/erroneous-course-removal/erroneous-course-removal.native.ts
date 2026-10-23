import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, caller, one, lo, dataDigests } from './erroneous-course-removal.fixture';
import { act, read as issuanceRead } from '../education-issuance/education-issuance.fixture';
import { ready, prepared, stage, rendered, finalAction } from '../education-issuance/education-issuance.scenario';
export const REMOVAL_CASES=[['ER01','erroneous unstarted course removal retained history ordinary reassign current rights and concurrency']] as const;
export const REMOVAL_FACTS=['preservationPassed','assignmentTimestampIsNotStudy','readerDenied','selfCancellationDenied','wrongTenantDenied','wrongGroupDenied','staleCasDenied','progressBlocks','timeBlocks','completionBlocks','lessonHistoryBlocks','attemptSessionBlocks','manualCreditBlocks','homeworkBlocks','distinctBackendPids','concurrentLearningBlocksRemoval','cancelRetainsEnrollment','cancelRetainsProfileCourse','snapshotPreservesFacts','learnerAccessStops','lateLearningWriteDenied','sameRequestReplaysOnce','changedPayloadDenied','revokedActorReplayDenied','revokedSubjectReplayDenied','ordinaryReassignSameEnrollment','ordinaryReassignAppendsActive','ordinaryReassignLearnerAccessWorks','repeatActiveUpdateDoesNotAppend','quotaNotRefunded','privateTableDenied','eventMutationDenied','subjectAndActorPrivacyCounted','snapshotBlocksDestructivePlanning','retainedFilesNotExportedOrDeleted','eraseStoppedBeforeMutation','activeListsExcludeCancelled','ordinarySelectorOffersCancelled','issuedDocumentsAndNumbersRetained','formalWithdrawalStillImmutable'] as const;
const output=process.env.UC116_NATIVE_OUTPUT;if(!output)throw Error('Owned isolated native lab required');
it('ER01 '+REMOVAL_CASES[0][1],async()=>{
 const evidence:any={id:'ER01',title:REMOVAL_CASES[0][1],status:'RUNNING',closed:false,fixtureClosed:false,facts:[],startedAtUtc:new Date().toISOString()};
 const persist=()=>writeFileSync(join(output,'erroneous-course-removal-cases.json'),JSON.stringify({status:evidence.status==='PASS'?'PASS':'INCOMPLETE_OR_FAILED',expectedCases:1,cases:[evidence]},null,2)+'\n');persist();
 let c:Awaited<ReturnType<typeof fixture>>|undefined;const facts:Record<string,boolean>={};const denials:Record<string,string>={};let phase='fixture';
 async function denied(action:()=>Promise<unknown>,code:string,key:string){let caught:any;try{await action();}catch(error){caught=error;}expect(caught,'Expected target operation denial: '+key).toBeTruthy();expect(caught.code,key).toBe(code);denials[key]=caught.code;return caught;}
 try{
  c=await fixture();const db=c.db,target=c.otherEnrollment,user=lo.otherStudent;phase='initial';
  evidence.database=db.native.name;evidence.facts.push({kind:'installed_uc013_stage',...db.__ucFullCycleSourceProof},c.appendFact,c.preservation);
  facts.preservationPassed=c.preservation.status==='PASS';
  // The genuine quota trigger ensures the target has a monthly assignment witness; no ledger row is seeded directly.
  await caller(db,lo.owner);await db.query('UPDATE enrollments SET started_at=clock_timestamp()WHERE id=$1',[target]);
  const initial=await c.read(target);expect(initial.can_remove).toBe(true);expect(initial.state).toBe('active');
  await db.exec('RESET ROLE');const before=await one<any>(db,'SELECT to_jsonb(e)d FROM enrollments e WHERE id=$1',[target]);expect(before.d.started_at).toBeTruthy();expect(before.d.progress).toBe(0);expect(before.d.time_spent).toBe(0);facts.assignmentTimestampIsNotStudy=true;
  async function rowCounts(){await db.exec('RESET ROLE');return(await one<any>(db,"SELECT jsonb_build_object('enrollment',(SELECT count(*)FROM enrollments WHERE id=$1),'profile',(SELECT count(*)FROM profiles WHERE user_id=$2),'course',(SELECT count(*)FROM courses WHERE id=$3))d",[target,user,lo.course])).d;}
  const immutableParents=await rowCounts();
  async function quota(){await db.exec('RESET ROLE');const result:any={};for(const table of ['organization_monthly_course_usage','organization_monthly_student_assignments','organization_monthly_training_completions']){const present=(await one<any>(db,'SELECT to_regclass($1)is not null p',['public.'+table])).p;expect(present,'Actual monthly quota table '+table).toBe(true);result[table]=(await one<any>(db,"SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY to_jsonb(r)::text),'[]')d FROM public."+table+' r')).d;}return result;}
  const quotaBefore=await quota(),quotaMonth=(await one<any>(db,"SELECT date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')::date::text AS quota_month")).quota_month;expect(quotaBefore.organization_monthly_course_usage.some((row:any)=>row.organization_id===lo.org&&row.month_start===quotaMonth&&row.assigned_students>=1)).toBe(true);expect(quotaBefore.organization_monthly_student_assignments.some((row:any)=>row.organization_id===lo.org&&row.user_id===user&&row.month_start===quotaMonth)).toBe(true);
  for(const[actor,key]of [[lo.reader,'readerDenied'],[user,'selfCancellationDenied']]as const){await caller(db,actor);await denied(()=>c!.read(target),'42501',key);facts[key]=true;}
  await caller(db,lo.owner);await denied(()=>c!.read(target,null,lo.foreign),'42501','wrongTenantDenied');facts.wrongTenantDenied=true;
  await denied(()=>c!.read(target,lo.group),'42501','wrongGroupDenied');facts.wrongGroupDenied=true;
  await denied(()=>c!.remove({...initial.ref,state_hash:'f'.repeat(64)}),'PT409','staleCasDenied');facts.staleCasDenied=true;
  async function historyTrial(key:string,setup:()=>Promise<unknown>){
   await db.exec('RESET ROLE;BEGIN');try{await setup();await caller(db,lo.owner);const blocked=await c!.read(target);expect(blocked.can_remove,key).toBe(false);await denied(()=>c!.remove(blocked.ref),'23514',key);facts[key]=true;}finally{await db.exec('ROLLBACK');await caller(db,lo.owner);}
  }
  phase='history-negatives';
  await historyTrial('progressBlocks',()=>db.query('UPDATE enrollments SET progress=1 WHERE id=$1',[target]));
  await historyTrial('timeBlocks',()=>db.query('UPDATE enrollments SET time_spent=1 WHERE id=$1',[target]));
  await historyTrial('completionBlocks',()=>db.query("UPDATE enrollments SET status='completed',completed_at=clock_timestamp()WHERE id=$1",[target]));
  await historyTrial('lessonHistoryBlocks',()=>db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,time_spent)VALUES($1,$2,false,0)',[user,lo.textLesson]));
  await historyTrial('attemptSessionBlocks',async()=>{await caller(db,user);const value=(await one<any>(db,'SELECT start_test_attempt($1,$2)d',[lo.test,randomUUID()])).d;expect(value.attemptId).toBeTruthy();});
  await historyTrial('manualCreditBlocks',()=>db.query('INSERT INTO course_manual_credits(enrollment_id,credited_by)VALUES($1,$2)',[target,lo.owner]));
  await historyTrial('homeworkBlocks',async()=>{await db.query("UPDATE lessons SET type='homework'WHERE id=$1",[lo.textLesson]);await db.query("INSERT INTO homework_submissions(student_id,course_id,lesson_id,organization_id,content,status)VALUES($1,$2,$3,$4,'Synthetic actual homework','submitted')",[user,lo.course,lo.textLesson,lo.org]);});
  phase='concurrency';
  const b=db.native.connect('er01_learning_concurrency');const pids=await Promise.all([one<any>(db,'SELECT pg_backend_pid()pid').then(x=>x.pid),b.pid()]);expect(new Set(pids).size).toBe(2);facts.distinctBackendPids=true;
  try{
   await caller(db,user);await db.exec('BEGIN');await db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,time_spent)VALUES($1,$2,false,0)',[user,lo.textLesson]);
   await caller(b,lo.owner);await denied(()=>one(b,'SELECT remove_erroneous_course_assignment($1,$2,$3,$4,$5)d',[lo.org,null,target,initial.ref.state_hash,randomUUID()]),'PT409','concurrentLearningBlocksRemoval');facts.concurrentLearningBlocksRemoval=true;
  }finally{for(const session of [db,b])try{await session.exec('ROLLBACK');}catch{/* owned fixture closes both tracked connections */}}
  phase='cancel';await db.exec('RESET ROLE');
  const retainedObject=randomUUID(),retainedPath=user+'/ER01-retained.pdf';await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner,owner_id,metadata)VALUES($1,'student-documents',$2,$3::uuid,$3::uuid::text,$4::jsonb)",[retainedObject,retainedPath,user,JSON.stringify({size:8,mimetype:'application/pdf',eTag:'synthetic-retained'})]);
  const filesBefore=(await one<any>(db,'SELECT account_deletion_files($1)d',[user])).d;expect(filesBefore.some((x:any)=>x.objectId===retainedObject)).toBe(true);
  await caller(db,user);expect((await one<any>(db,'SELECT can_access_course_as_learner($1)allowed',[lo.course])).allowed).toBe(true);
  await caller(db,lo.owner);const check=await c.read(target),request=randomUUID(),cancelled=await c.remove(check.ref,request);expect(cancelled).toMatchObject({cancelled:true,retained:true,enrollment_id:target,user_id:user,actor_id:lo.owner,request_id:request,replayed:false});
  await db.exec('RESET ROLE');const after=(await one<any>(db,'SELECT to_jsonb(e)d FROM enrollments e WHERE id=$1',[target])).d;expect(after.status).toBe('cancelled');expect({...after,status:before.d.status,document_facts_revision:before.d.document_facts_revision,...('updated_at'in before.d?{updated_at:before.d.updated_at}:{})}).toEqual(before.d);facts.cancelRetainsEnrollment=true;
  expect(await rowCounts()).toEqual(immutableParents);facts.cancelRetainsProfileCourse=true;
  const event=await one<any>(db,'SELECT *FROM uc_course_assignment_removal_events WHERE enrollment_id=$1',[target]);expect(event.before_enrollment).toEqual(before.d);expect(event.after_enrollment).toEqual(after);facts.snapshotPreservesFacts=true;
  expect(await quota()).toEqual(quotaBefore);facts.quotaNotRefunded=true;
  await caller(db,user);expect((await one<any>(db,'SELECT can_access_course_as_learner($1)allowed',[lo.course])).allowed).toBe(false);facts.learnerAccessStops=true;
  await denied(()=>db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,time_spent)VALUES($1,$2,false,1)',[user,lo.textLesson]),'42501','lateLearningWriteDenied');facts.lateLearningWriteDenied=true;
  await caller(db,lo.owner);const again=await c.remove(check.ref,request);expect(again).toEqual({...cancelled,replayed:true});await db.exec('RESET ROLE');expect((await one<any>(db,'SELECT count(*)::int n FROM uc_course_assignment_removal_events WHERE enrollment_id=$1',[target])).n).toBe(1);facts.sameRequestReplaysOnce=true;
  await caller(db,lo.owner);await denied(()=>c!.remove({...check.ref,state_hash:'a'.repeat(64)},request),'PT409','changedPayloadDenied');facts.changedPayloadDenied=true;
  for(const[person,key]of [[lo.owner,'revokedActorReplayDenied'],[user,'revokedSubjectReplayDenied']]as const){await db.exec('RESET ROLE;BEGIN');try{await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[person]);await caller(db,lo.owner);await denied(()=>c!.remove(check.ref,request),'42501',key);facts[key]=true;}finally{await db.exec('ROLLBACK');}}
  phase='privacy';await db.exec('RESET ROLE');
  for(const person of [user,lo.owner]){
   const counts=(await one<any>(db,'SELECT uc_education_personal_counts($1)d',[person])).d;expect(counts.some((x:any)=>x.table==='uc_course_assignment_removal_events'&&x.count>0)).toBe(true);
   const snapshot=(await one<any>(db,'SELECT account_deletion_snapshot($1)d',[person])).d;expect(snapshot.blockers.some((x:any)=>x.code==='RETENTION_POLICY_REQUIRED')).toBe(true);expect(snapshot.categories.some((x:any)=>x.key==='retained_assignment_removals'&&x.action==='retain')).toBe(true);
   expect((await one<any>(db,'SELECT account_deletion_files($1)d',[person])).d).toEqual([]);
   const beforeErase=await dataDigests(db);await db.exec('BEGIN');try{await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[person]);await caller(db,null,'service_role');await db.exec('RESET ROLE');await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[person]);const blockedErase=await denied(()=>one(db,'SELECT uc_scoped_journal_erase_user($1)',[person]),'P0001','erase_'+person);expect(blockedErase.message).toBe('COURSE_ASSIGNMENT_REMOVAL_RETENTION_REVIEW_REQUIRED');}finally{await db.exec('ROLLBACK');}expect(await dataDigests(db)).toEqual(beforeErase);
  }
  facts.subjectAndActorPrivacyCounted=true;facts.snapshotBlocksDestructivePlanning=true;facts.eraseStoppedBeforeMutation=true;
  await db.exec('RESET ROLE');expect((await one<any>(db,'SELECT count(*)::int n FROM storage.objects WHERE id=$1',[retainedObject])).n).toBe(1);expect(await rowCounts()).toEqual(immutableParents);facts.retainedFilesNotExportedOrDeleted=true;
  await caller(db,lo.owner);await denied(()=>db.query('SELECT *FROM uc_course_assignment_removal_events'),'42501','privateTableDenied');facts.privateTableDenied=true;
  await db.exec('RESET ROLE;BEGIN');try{await denied(()=>db.query("UPDATE uc_course_assignment_removal_events SET state='active'WHERE id=$1",[event.id]),'42501','eventMutationDenied');facts.eventMutationDenied=true;}finally{await db.exec('ROLLBACK');}
  phase='active-lists';await caller(db,lo.owner);
  const listed=await db.query('SELECT *FROM get_course_student_test_results_page($1,100,0,NULL,NULL,NULL)',[lo.course]);expect(listed.rows.some((x:any)=>x.enrollment_id===target)).toBe(false);
  const orgRows=await db.query("SELECT *FROM get_organization_students_page($1,100,0,NULL,NULL,NULL,NULL,NULL,'active')",[lo.org]);const pupil=orgRows.rows.find((x:any)=>x.user_id===user);expect(pupil).toBeTruthy();expect(pupil.enrollments.some((x:any)=>x.id===target)).toBe(false);facts.activeListsExcludeCancelled=true;
  const available=await db.query('SELECT *FROM get_available_students_for_course_page($1,100,0,NULL)',[lo.course]);expect(available.rows.some((x:any)=>x.user_id===user)).toBe(true);facts.ordinarySelectorOffersCancelled=true;
  phase='ordinary-reassign';const restored=await c.authenticatedUpdate(target);expect(restored.id).toBe(target);expect(restored.status).toBe('active');facts.ordinaryReassignSameEnrollment=true;
  await db.exec('RESET ROLE');const events=await db.query('SELECT *FROM uc_course_assignment_removal_events WHERE enrollment_id=$1 ORDER BY revision',[target]);expect(events.rows.map((x:any)=>x.state)).toEqual(['cancelled','active']);expect(events.rows[0]).toEqual(event);facts.ordinaryReassignAppendsActive=true;
  await caller(db,user);expect((await one<any>(db,'SELECT can_access_course_as_learner($1)allowed',[lo.course])).allowed).toBe(true);facts.ordinaryReassignLearnerAccessWorks=true;
  await caller(db,lo.owner);await c.authenticatedUpdate(target);await db.exec('RESET ROLE');expect((await one<any>(db,'SELECT count(*)::int n FROM uc_course_assignment_removal_events WHERE enrollment_id=$1',[target])).n).toBe(2);facts.repeatActiveUpdateDoesNotAppend=true;expect(await quota()).toEqual(quotaBefore);
  phase='real-issued-document';const setup=await ready(c),prep=await prepared(c,setup),staged=await stage(c,prep),render=await rendered(c,staged);await caller(db,lo.owner);const issued=await act(db,finalAction(render));expect(issued.records.length).toBeGreaterThan(0);
  await db.exec('RESET ROLE');const numbered=(await one<any>(db,"SELECT jsonb_build_object('records',(SELECT jsonb_agg(to_jsonb(d)ORDER BY d.id)FROM education_document_records d WHERE d.organization_id=$1),'numbers',(SELECT jsonb_agg(to_jsonb(n)ORDER BY to_jsonb(n)::text)FROM document_number_sequences n))d",[lo.org])).d;
  await caller(db,lo.owner);const blockedDocument=await c.read(c.enrollment);expect(blockedDocument.can_remove).toBe(false);await denied(()=>c!.remove(blockedDocument.ref),'23514','issued_document_history');
  const basis={kind:'learner_request',source:setup.local.source,provision:'Synthetic exact reviewed request',reason:'Synthetic genuine retained withdrawal'};const intent={enrollment_ids:[c.enrollment],effective_date:c.date,basis};const preview=(await issuanceRead(db,{kind:'withdrawal_preview',intent})).preview;
  await act(db,{action:'withdraw_enrollments',intent,preview_hash:preview.preview_hash,items:preview.items.map((x:any)=>x.ref),reason:'Synthetic explicit retained withdrawal'});
  await db.exec('RESET ROLE');
  const formalSnapshot=async()=> (await one<any>(db,"SELECT jsonb_build_object('enrollment',(SELECT to_jsonb(e)FROM enrollments e WHERE e.id=$1),'withdrawal',(SELECT to_jsonb(w)FROM uc_enrollment_withdrawal_states w WHERE w.enrollment_id=$1),'documents',(SELECT coalesce(jsonb_agg(to_jsonb(d)ORDER BY d.id),'[]')FROM education_document_records d WHERE d.organization_id=$2))d",[c!.enrollment,lo.org])).d;
  const retainedBefore=await formalSnapshot();await caller(db,lo.owner);let formalUpdate:any,formalError:any;try{formalUpdate=await one<any>(db,"UPDATE enrollments SET access_days=coalesce(access_days,0)+1 WHERE id=$1 RETURNING *",[c.enrollment]);}catch(error){formalError=error;}
  if(formalError){expect(formalError.code).toBe('42501');denials.formalWithdrawalStillImmutable=formalError.code;}else{expect(formalUpdate).toBeUndefined();denials.formalWithdrawalStillImmutable='NO_AFFECTED_ROW';}
  await db.exec('RESET ROLE');expect(await formalSnapshot()).toEqual(retainedBefore);
  // RLS can reject the ordinary UPDATE before its trigger. Independently reach
  // the retained guard with the same original actor in the disposable lab.
  await db.exec('BEGIN');try{await caller(db,lo.owner);await db.exec('RESET ROLE');await denied(()=>db.query("UPDATE enrollments SET access_days=coalesce(access_days,0)+1 WHERE id=$1 RETURNING *",[c!.enrollment]),'42501','formalRetainedGuardStillImmutable');}finally{await db.exec('ROLLBACK');}
  expect(await formalSnapshot()).toEqual(retainedBefore);expect((await one<any>(db,"SELECT count(*)::int n FROM uc_course_assignment_removal_events WHERE enrollment_id=$1 AND state='active'",[c.enrollment])).n).toBe(0);await caller(db,lo.student);expect((await one<any>(db,'SELECT can_access_course_as_learner($1)allowed',[lo.course])).allowed).toBe(false);facts.formalWithdrawalStillImmutable=true;
  await db.exec('RESET ROLE');const numberedAfter=(await one<any>(db,"SELECT jsonb_build_object('records',(SELECT jsonb_agg(to_jsonb(d)ORDER BY d.id)FROM education_document_records d WHERE d.organization_id=$1),'numbers',(SELECT jsonb_agg(to_jsonb(n)ORDER BY to_jsonb(n)::text)FROM document_number_sequences n))d",[lo.org])).d;expect(numberedAfter).toEqual(numbered);facts.issuedDocumentsAndNumbersRetained=true;
  for(const key of REMOVAL_FACTS)expect(facts[key],key).toBe(true);evidence.facts.push({kind:'erroneous_assignment_removal',...facts,denials,actualBackendPids:pids,syntheticStorageOnly:true,noStorageHttpClaim:true,noProductionMutations:true});evidence.status='PASS';
 }catch(error){const value=error as any;evidence.status='FAIL';evidence.partialFacts={...facts};evidence.partialDenials={...denials};evidence.error={phase,message:value?.message,code:value?.code,position:value?.position,where:value?.where};throw error;
 }finally{try{await c?.db.close();evidence.fixtureClosed=true;}finally{evidence.closed=true;evidence.finishedAtUtc=new Date().toISOString();persist();}}
});
