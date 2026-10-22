// Supplemental genuine PO recognition and correction-replacement acceptance.
// Reuses unchanged main-nine fixture/scenario; synthetic trusted render bytes are not Browserless proof.
import{randomUUID}from'node:crypto';
import{caller,one,lo,sha,read,prepare,organization}from'./education-issuance.fixture';
import{type C}from'./education-issuance.scenario';
export async function seedProfessionalTraining(c:C) {
  const db=c.db,po=Object.fromEntries(['course','group','otherGroup','program','test','otherTest','module','textLesson','secondTextLesson','component','theoryComponent','enrollment'].map(k=>[k,randomUUID()])) as Record<string,string>;
  const request = () => randomUUID();
  const row = (sql: string, args: any[] = []) => one<any>(db, sql, args);
  await caller(db,lo.owner);await db.exec('RESET ROLE');
  await db.query("INSERT INTO courses(id,organization_id,title,is_published)VALUES($1,$2,'Synthetic outcome course',true)", [po.course, lo.org]);
  await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic exact group'),($4,$2,$3,'Synthetic other group')", [po.group, lo.org, po.course, po.otherGroup]);
  await caller(db, lo.owner);
  const document=await c.saveDocument('Synthetic approved PO programme','education_program');
  const facts = { schema_version: 1, full_title: 'Synthetic approved professional training programme', program_type: 'professional_training', academic_hours: 72, training_form: 'part_time', uses_elearning: true, uses_distance_learning: true, duration_calendar: 'Synthetic two days', attestation_form: 'Synthetic qualification examination with theory and reviewed practical protocol', attestation_criteria: 'Explicit approved theory threshold and authorized recognition of exact protocol; not progress100', qualification: 'Synthetic reviewed qualification', profession: 'Synthetic training profession' };
  let program = (await row('SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,0,$7)d', [lo.org, po.program, 'Synthetic programme', document.version_id, lo.reviewer, JSON.stringify(facts), request()])).d;
  program = (await row("SELECT transition_program_facts_version($1,$2,'submit',NULL,$3)d", [program.id, program.revision, request()])).d;
  await caller(db, lo.reviewer); program = (await row("SELECT transition_program_facts_version($1,$2,'approve',NULL,$3)d", [program.id, program.revision, request()])).d;
  await caller(db, lo.owner);
  await row('SELECT bind_course_program_version($1,$2,$3,0,$4)d', [lo.org, po.course, program.id, request()]);
  await row('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)d', [lo.org, po.group, po.course, program.id, request()]);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO course_modules(id,course_id,title,order_index)VALUES($1,$2,'Synthetic required module',0)", [po.module, po.course]);
  for (const [id, title, type, module] of [[po.test, 'Explicit main test', 'test', null], [po.otherTest, 'Another final-looking test', 'test', null], [po.textLesson, 'Required text', 'text', po.module], [po.secondTextLesson, 'Required next text', 'text', po.module]]) {
    await db.query('INSERT INTO lessons(id,course_id,title,type,order_index,module_id,test_max_attempts,test_max_attempts_per_day,test_questions_to_show,test_passing_score,test_show_answers)VALUES($1,$2,$3,$4,$5,$6,100,100,20,60,false)', [id, po.course, title, type, id === po.test ? 0 : 1, module]);
  }
  for (let n = 0; n < 20; n++) await db.query("INSERT INTO test_questions(id,lesson_id,question,options,correct_answer,order_index)VALUES($1,$2,$3,'[\"yes\",\"no\"]',0,$4)", [randomUUID(), po.test, 'Synthetic question ' + n, n]);
  await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)', [lo.org, po.group, lo.student]);
  const enrollment = await row("INSERT INTO enrollments(id,user_id,course_id,status,progress,time_spent)VALUES($1,$2,$3,'active',0,0)RETURNING id", [po.enrollment, lo.student, po.course]);
  const snapshot = await row('SELECT id FROM group_program_enrollment_snapshots WHERE enrollment_id=$1 AND group_id=$2', [enrollment.id, po.group]);
  await caller(db, lo.owner);
  const scope = { organization_id: lo.org, group_id: po.group, user_id: lo.student, course_id: po.course, enrollment_id: enrollment.id, program_enrollment_snapshot_id: snapshot.id, program_version_id: program.id };
  const action = async (command: Record<string, unknown>, requestId = request()) => (await row('SELECT apply_learning_outcome_action($1,$2,$3)d', [lo.org, requestId, JSON.stringify(command)])).d;
  const readOutcome = async () => (await row('SELECT read_learning_outcome($1,$2)d', [lo.org, JSON.stringify({ kind: 'outcome', scope })])).d;
  const criteria = async (definition:any) => {
    await caller(db, lo.owner);
    const saved = await action({ action: 'save_criteria_version', course_id: po.course, program_version_id: program.id, draft_id: null, expected_revision: 0, definition, reason: 'Synthetic explicit criteria draft' });
    const draft = saved.current.versions.find((v: any) => v.id === saved.receipt.event_id);
    await caller(db, lo.reviewer);
    await action({ action: 'approve_criteria_version', version_id: draft.id, expected_revision: draft.revision, expected_content_hash: draft.content_hash, reason: 'Synthetic actual reviewer approval' });
    await caller(db, lo.owner); return draft.id;
  };
  const attempt = async (correct: number, total = 20, requestId = request()) => {
    await db.exec('RESET ROLE'); await db.query('UPDATE lessons SET test_questions_to_show=$1 WHERE id=$2', [total, po.test]);
    await caller(db, lo.student); const started = (await row('SELECT start_test_attempt($1,$2)d', [po.test, requestId])).d;
    await db.exec('RESET ROLE'); const session = await row('SELECT questions_snapshot FROM test_attempt_sessions WHERE id=$1', [started.attemptId]);
    const answers = Object.fromEntries(session.questions_snapshot.map((q: any, index: number) => [q.id, index < correct ? 0 : 1]));
    await caller(db, lo.student); const grade = (await row('SELECT submit_test_attempt($1,$2)d', [started.attemptId, JSON.stringify(answers)])).d;
    return { started, grade };
  };
  const capture = async () => {
    const current = await readOutcome();
    return action({ action: 'capture_machine_result', scope, expected_revision: current.revision, expected_criteria_ref: current.criteria_ref, reason: 'Synthetic requested technical snapshot' });
  };
  return { db, scope, program, fileVersion: document.version_id, request, action, readOutcome, criteria, attempt, capture,ids:po };
}
export async function readyProfessionalTraining(c:C,po:Awaited<ReturnType<typeof seedProfessionalTraining>>){const db=c.db;await caller(db,lo.owner);
 const local=await c.saveDocument('Synthetic reviewed admission rules','admission_rules');
 let state=(await one<any>(db,'SELECT read_student_admission_case($1,$2,$3)d',[lo.org,lo.student,JSON.stringify({mode:'case',group_id:po.ids.group,enrollment_id:po.scope.enrollment_id})])).d;
 const command=async(extra:any)=>{await caller(db,lo.owner);const cmd={case_id:state.state.id,expected_revision:state.state.revision,expected_program_ref:state.state.program_ref,...extra};const value=(await one<any>(db,'SELECT apply_student_admission_case_action($1,$2,$3,$4)d',[lo.org,lo.student,randomUUID(),JSON.stringify(cmd)])).d;state={...state,state:value.state};return value;};
 const initialized=(await one<any>(db,'SELECT apply_student_admission_case_action($1,$2,$3,$4)d',[lo.org,lo.student,randomUUID(),JSON.stringify({action:'initialize',group_id:po.ids.group,enrollment_id:po.scope.enrollment_id,expected_program_ref:state.program_ref,expected_revision:0})])).d;state={...state,state:initialized.state};
 await command({action:'assign_responsible',responsible_id:lo.owner,reason:'Synthetic explicitly assigned admission reviewer'});
 const definitions=['education_basis','application','contract_or_funding'].map((kind,index)=>({key:kind,kind,staff_label:'Synthetic reviewed '+kind,source_version_ids:[local.version_id],provision:'Synthetic exact reviewed provision '+index,exception_policy:'not_defined',...(index===0?{issuance_condition:{kind:'no_separate_primary_education_condition',reason:'Synthetic explicitly reviewed PO admission condition; not a DPO qualification or legal certification'}}:{})}));
 await command({action:'review_local_rules',sources:[{document_id:local.document_id,version_id:local.version_id,review_id:local.review.id}],requirements:definitions,review_reason:'Synthetic explicit local rules; not a legal certification'});
 const education=()=>state.state.requirements.find((x:any)=>state.state.issuance_conditions.some((y:any)=>y.requirement_id===x.id));
 const evidenceBytes=Buffer.from('%PDF-1.4\nSynthetic PO admission application evidence\n%%EOF\n'),evidenceHash=sha(evidenceBytes),commitRequest=randomUUID();
 const reservation=(await one<any>(db,'SELECT prepare_admission_case_evidence($1,$2,$3,$4,$5)d',[state.state.id,state.state.revision,JSON.stringify(state.state.program_ref),randomUUID(),JSON.stringify({kind:'upload',requirement_id:education().id,supersedes_id:null,declared_size:evidenceBytes.length,declared_mime:'application/pdf',declared_sha256:evidenceHash})])).d;
 await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(id,bucket_id,name,metadata,owner,owner_id,updated_at)VALUES($1,'admission-case-evidence',$2,$3::jsonb,$4::uuid,$4::uuid::text,clock_timestamp())",[randomUUID(),reservation.upload_slot.path,JSON.stringify({size:evidenceBytes.length,eTag:evidenceHash,mimetype:'application/pdf'}),lo.owner]);
 await caller(db,lo.owner);let context=(await one<any>(db,'SELECT uc_admission_evidence_context($1,$2,$3,$4)d',[state.state.id,reservation.reservation_id,state.state.revision,commitRequest])).d;
 await caller(db,null,'service_role');await db.exec('RESET ROLE');const sealedId=randomUUID();await db.query("INSERT INTO storage.objects(id,bucket_id,name,metadata,updated_at)VALUES($1,'admission-case-evidence',$2,$3::jsonb,clock_timestamp())",[sealedId,context.sealed.path,JSON.stringify({size:evidenceBytes.length,eTag:evidenceHash,mimetype:'application/pdf'})]);const sealed=await one<any>(db,'SELECT updated_at FROM storage.objects WHERE id=$1',[sealedId]);
 await caller(db,null,'service_role');await one(db,'SELECT uc_attest_admission_case_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)d',[lo.owner,state.state.id,reservation.reservation_id,state.state.revision,commitRequest,context.source.object_id,context.source.updated_at,context.source.fingerprint,sealedId,sealed.updated_at,evidenceHash,evidenceBytes.length,'application/pdf']);
 await caller(db,lo.owner);state.state=(await one<any>(db,'SELECT uc_finalize_admission_case_evidence($1,$2,$3,$4)d',[state.state.id,reservation.reservation_id,state.state.revision,commitRequest])).d.state;
 let q=education();await command({action:'review_evidence',requirement_id:q.id,expected_requirement_revision:q.revision,evidence_version_id:reservation.evidence_version_id,byte_sha256:evidenceHash,outcome:'accepted',reason:'Synthetic explicit review of sealed exact bytes'});
 const educationRef=education().id;for(const requirement of[...state.state.requirements])await command({action:'review_requirement',requirement_id:requirement.id,expected_requirement_revision:requirement.revision,applicability:requirement.id===educationRef?'applicable':'not_applicable',evidence_version_ids:requirement.id===educationRef?[reservation.evidence_version_id]:[],reason:'Synthetic reviewed applicability; no guessed default',exception:null,...(requirement.id===educationRef?{issuance_evidence:null}:{})});
 const decision=()=>command({action:'record_decision',rule_set_id:state.state.rule_set_id,rule_set_digest:state.state.rule_set_digest,requirements_digest:state.state.requirements_digest,evidence_version_ids:[reservation.evidence_version_id],outcome:'admitted',reason:'Synthetic admission by actual existing case engine'});await decision();
 const template=await c.saveDocument('Synthetic approved actual certificate template','other',c.templateBytes,'text/html');
 return{local,template,reservation,evidenceBytes,evidenceHash,get state(){return state.state;}};
}
export async function prepareProfessionalTraining(c:C,po:Awaited<ReturnType<typeof seedProfessionalTraining>>,setup:Awaited<ReturnType<typeof readyProfessionalTraining>>){await caller(c.db,lo.owner);const candidates=await read(c.db,{kind:'candidates',course_id:po.ids.course,after_enrollment_id:null,limit:100,filter:'all'});const candidate=candidates.items.find((x:any)=>x.enrollment_id===po.scope.enrollment_id);if(!candidate?.eligibility_ref)throw Error('Actual PO eligibility blocked '+JSON.stringify(candidate?.blockers));const intent={course_id:po.ids.course,enrollment_ids:[po.scope.enrollment_id],issue_date:c.date,document_series:null};const preview=(await read(c.db,{kind:'preview_issue',intent})).preview;return(await prepare(c.db,{kind:'original',intent,preview_hash:preview.preview_hash,items:[{enrollment_id:po.scope.enrollment_id,expected_eligibility_ref:candidate.eligibility_ref}],template:setup.template.template,reason:'Synthetic explicit PO qualification issuance, no handover'})).preparation;}
export async function correctTypedIdentity(c:C,last:string,first:string,middle:string,birth:string){await caller(c.db,lo.owner);await c.db.exec('RESET ROLE');await c.db.query('UPDATE profiles SET full_name=$1 WHERE user_id=$2 AND organization_id=$3',[last+' '+first+' '+middle,lo.student,lo.org]);await c.db.query('UPDATE student_frdo_data SET last_name=$1,first_name=$2,middle_name=$3,birth_date=$4 WHERE user_id=$5 AND organization_id=$6',[last,first,middle,birth,lo.student,lo.org]);await caller(c.db,lo.owner);}
