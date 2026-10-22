// SOURCE ONLY. Canonical mirror: supabase/tests/native/full-cycle/full-cycle.fixture.ts.
// This extends the real UC013 fixture. It never creates a PGlite database, replaces
// an authority predicate, bypasses a migration guard, or invokes a private eraser.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createUcGroupEducationFixture,executeAsGroupEducationCaller} from '../../../functions/_shared/uc-group-education-facts.fixture';
import {seedLearningScenario,learningAs,learningDefinition,lo} from '../../../functions/_shared/uc-learning-outcomes.fixture';

export {lo,learningDefinition};
export type Connection={exec(sql:string):Promise<any>;query<T=any>(sql:string,args?:any[]):Promise<{rows:T[]}>;pid():Promise<number>;label?:string};
export type FullCycleDb=Awaited<ReturnType<typeof createUcGroupEducationFixture>>&{native:{connect(label:string):Connection;name:string;record:any}};
export const read=(path:string)=>readFileSync(path,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
const q=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
const md5=(s:string)=>createHash('md5').update(s).digest('hex');
export const one=async<T=any>(db:Pick<Connection,'query'>,sql:string,args:any[]=[]):Promise<T>=>(await db.query<T>(sql,args)).rows[0];
export const caller=(db:any,user:string|null,role='authenticated')=>executeAsGroupEducationCaller(db,user,role);

/** The old foundational fixture intentionally omitted legacy display columns.
 * Restore the freshly captured actual two-table shape before synthetic rows
 * exist. No legacy policy, privilege, trigger or privacy fence is removed. */
async function restoreLegacyJournalShape(db:FullCycleDb){
 const raw=readFileSync('supabase/tests/fixtures/uc-full-cycle-legacy-journal-live.json');
 if(createHash('sha256').update(raw).digest('hex')!=='9ed6b53c1261a3d10a3d4795822bb464974cf9d688c51183330c4b398c5a4fe4')throw Error('Fresh actual legacy journal capture changed');
 const metadata=JSON.parse(raw.toString('utf8')).result.rows[0].legacy_journal_metadata;
 if(metadata.customer_rows_read!==false||metadata.context.read_only!=='on'||metadata.context.search_path!=='pg_catalog, public')throw Error('Legacy journal capture context changed');
 const relations=metadata.relations;
 if(relations.length!==2||relations.map((r:any)=>r.name).sort().join(',')!=='journal_entries,journal_instances')throw Error('Exact two legacy relations required');
 for(const r of relations){
  if(Number((await one(db,`SELECT count(*)n FROM public.${q(r.name)}`)).n)!==0)throw Error('Legacy shape restoration requires the empty foundational fixture');
  for(const c of r.columns){
   if(c.attgenerated||c.attidentity||c.attisdropped)throw Error('Unexpected actual legacy column kind');
   const current=await one(db,'SELECT format_type(atttypid,atttypmod)t FROM pg_attribute WHERE attrelid=$1::regclass AND attname=$2 AND NOT attisdropped',['public.'+r.name,c.attname]);
   if(current&&current.t!==c.formatted_type)throw Error('Old legacy type differs: '+r.name+'.'+c.attname);
   if(!current)await db.exec(`ALTER TABLE public.${q(r.name)} ADD COLUMN ${q(c.attname)} ${c.formatted_type}`);
   await db.exec(`ALTER TABLE public.${q(r.name)} ALTER COLUMN ${q(c.attname)} ${c.default?'SET DEFAULT '+c.default:'DROP DEFAULT'}`);
   await db.exec(`ALTER TABLE public.${q(r.name)} ALTER COLUMN ${q(c.attname)} ${c.attnotnull?'SET':'DROP'} NOT NULL`);
  }
 }
 for(const foreign of[false,true])for(const r of relations)for(const c of r.constraints){
  if((c.contype==='f')!==foreign)continue;
  const current=await one(db,'SELECT pg_get_constraintdef(oid,true)d FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',['public.'+r.name,c.conname]);
  if(current&&current.d!==c.definition)throw Error('Old legacy constraint differs: '+c.conname);
  if(!current)await db.exec(`ALTER TABLE public.${q(r.name)} ADD CONSTRAINT ${q(c.conname)} ${c.definition}`);
 }
 for(const r of relations)for(const index of r.indexes){
  const name=/\bINDEX\s+(\S+)\s+ON\b/i.exec(index.definition)?.[1];if(!name)throw Error('Captured legacy index name missing');
  const current=await one(db,'SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname=$2',['public',name]);
  if(current&&current.indexdef!==index.definition)throw Error('Old legacy index differs: '+name);
  if(!current)await db.exec(index.definition);
 }
}

async function verifyInstalledUc013Stage51(db:FullCycleDb){
 const witness=JSON.parse(read('docs/releases/sintagma-production/uc-group-education-facts-20261019/counter51-integration-witness.json'));
 const expected=witness.expectedFunctions51,portable=witness.expectedPortableCatalog51;
 if(expected.length!==51||portable.length!==51||new Set(expected.map((x:any)=>x.signature)).size!==51)throw Error('Exact folded UC01351 catalog witness required');
 const migration=read('supabase/migrations/20261019120000_uc_group_education_facts.sql');
 if(createHash('sha256').update(migration).digest('hex')!==witness.foldedMigrationSha256)throw Error('Folded actual UC013 source changed');
 const installed=(await db.query<any>("SELECT p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')'signature,md5(pg_get_functiondef(p.oid))definition_md5,md5(p.prosrc)source_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_group_education_%'OR p.proname IN('read_group_education_facts','apply_group_education_facts_action','uc_erase_group_education_facts'))ORDER BY signature")).rows;
 if(installed.length!==51)throw Error('Actual installed UC013 function count is not51');
 for(const f of expected){const actual=installed.find(x=>x.signature===f.signature),p=portable.find((x:any)=>x.signature===f.signature);if(!actual||!p||actual.definition_md5!==f.definition_md5||actual.definition_md5!==p.definition_md5||(p.source_md5&&actual.source_md5!==p.source_md5))throw Error('Actual UC01351 function differs: '+f.signature);}
 (db as any).__ucFullCycleSourceProof={functionCount:51,definitionsVerified:51,sourceMD5VerifiedWherePresent:true,foldedMigrationSha256:witness.foldedMigrationSha256};
}

/** Same exact captured UC014 source/DDL prerequisites as its existing fixture,
 * applied to the ALREADY installed UC013 database. Existing 013/privacy bodies
 * are not replaced by the old UC115 fixture or by UC015's reduced table model. */
async function installLearningPrerequisites(db:FullCycleDb){
 const session=JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-baseline.json'));
 const source=JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-source-metadata.json')).metadata;
 const paid=JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-paid-access.json')).functions;
 await db.exec(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;
 ALTER TABLE courses ADD COLUMN IF NOT EXISTS require_final_test_photo boolean DEFAULT false;
 ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_course_id uuid;
 ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_order_id uuid;
 ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
 ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
 INSERT INTO storage.buckets(id,name,public)VALUES('final-test-photos','final-test-photos',false)ON CONFLICT(id)DO NOTHING;
 CREATE TABLE IF NOT EXISTS test_questions(id uuid PRIMARY KEY,lesson_id uuid,question text,options jsonb,correct_answer integer,order_index integer,explanation text,image_url text,is_bank_question boolean DEFAULT false);`);
 const relations=[...source.relations,...session.relations];
 for(const r of relations){
  if(!(await one(db,'SELECT to_regclass($1)id',['public.'+r.name])).id)await db.exec(`CREATE TABLE public.${q(r.name)}(${r.columns.map((c:any)=>`${q(c.name)} ${c.type}`).join(',')})`);
  for(const c of r.columns){await db.exec(`ALTER TABLE public.${q(r.name)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${c.type}`);if(c.default)await db.exec(`ALTER TABLE public.${q(r.name)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);if(c.not_null)await db.exec(`ALTER TABLE public.${q(r.name)} ALTER COLUMN ${q(c.name)} SET NOT NULL`);}
 }
 for(const foreign of[false,true])for(const r of relations)for(const c of r.constraints??[]){
  if(/^FOREIGN KEY\b/.test(c.definition)!==foreign)continue;
  const prior=await one(db,'SELECT pg_get_constraintdef(oid,true)definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',['public.'+r.name,c.name]);
  if(prior&&prior.definition!==c.definition)throw Error('Captured constraint differs: '+c.name);
  if(!prior)await db.exec(`ALTER TABLE public.${q(r.name)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 }
 const projection=JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-question-projection.json')).function;
 const photoObject=JSON.parse(read('supabase/tests/fixtures/uc-learning-outcomes-photo-object.json')).function;
 const functions=[photoObject,projection,paid.find((f:any)=>f.signature==='_paid_20260922_original_ids()'),paid.find((f:any)=>f.signature==='_paid_20260922_course_scope(uuid)'),source.functions.find((f:any)=>f.signature==='can_access_course_as_learner(uuid)'),paid.find((f:any)=>f.signature==='_paid_20260922_course_read(uuid,boolean)'),...source.functions.filter((f:any)=>f.signature!=='can_access_course_as_learner(uuid)')];
 for(const f of functions){
  if(!f||md5(f.definition)!==f.definition_md5)throw Error('Captured actual learning prerequisite corrupt');
  await db.exec(f.definition);await db.exec(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  if(/[{,]=X\//.test(f.acl??''))await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO PUBLIC`);
  for(const role of['anon','authenticated','service_role'])if((f.acl??'').includes(role+'=X/'))await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${role}`);
 }
 for(const r of session.relations)for(const t of r.triggers)if(!t.internal&&t.name==='account_deletion_subject_fence'){await db.exec(`DROP TRIGGER IF EXISTS ${q(t.name)} ON public.${q(r.name)}`);await db.exec(t.definition);}
 for(const r of session.relations){await db.exec(`REVOKE ALL ON public.${q(r.name)} FROM PUBLIC,anon,authenticated,service_role`);for(const role of['anon','authenticated','service_role']){const privileges=r.effective_acl.filter((a:any)=>a.grantee===role).map((a:any)=>a.privilege);if(privileges.length)await db.exec(`GRANT ${privileges.join(',')} ON public.${q(r.name)} TO ${role}`);}}
}

export async function createFullCycleFixture(stage51Output?:string){
 const db=await createUcGroupEducationFixture(true) as FullCycleDb;
 try{
  if(!db.native)throw Error('Full cycle requires actual native PostgreSQL; PGlite fallback is forbidden');
  const v=Number((await one(db,"SELECT current_setting('server_version_num')v")).v);if(v<170000||v>=180000)throw Error('Native PostgreSQL17 required');
  await db.exec("RESET ROLE;SET TIME ZONE 'UTC'");
  await verifyInstalledUc013Stage51(db);
  if(stage51Output)(db as any).__ucFullCycleStage51Metadata=await captureStage51PrepareMetadata(db,stage51Output);
  await restoreLegacyJournalShape(db);
  // UC015 checks this urgent production RPC. Install the exact captured body,
  // never the reduced UC015 synthetic table/ledger/authority fixture.
  const journal=JSON.parse(read('supabase/tests/fixtures/uc-custom-journals-source-baseline.json'));
  // This old fixture transport has one extra terminal LF beyond actual
  // pg_get_functiondef. Both complete byte strings are pinned; no trim or
  // arbitrary normalization, SQL-body edit, or weakened product guard is allowed.
  const urgentTransport=journal.urgent_rpc.definition;
  if(md5(urgentTransport)!=='6d1c2e3acd35ac0f484124def12ee513'||!urgentTransport.endsWith('\n\n'))throw Error('Urgent exact transport capture corrupt');
  const urgentCanonical=urgentTransport.slice(0,-1);
  if(journal.urgent_rpc.expected_definition_md5!=='f38189a9960f714e43a3ebcbc60f336e'||md5(urgentCanonical)!=='f38189a9960f714e43a3ebcbc60f336e')throw Error('Urgent canonical actual definition corrupt');
  await db.exec(urgentCanonical);
  const urgentInstalled=(await one(db,"SELECT pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)d")).d;
  if(urgentInstalled!==urgentCanonical||md5(urgentInstalled)!=='f38189a9960f714e43a3ebcbc60f336e')throw Error('Urgent installed actual definition differs');
  (db as any).__ucFullCycleSourceProof.urgentRPCFraming={transportMD5:'6d1c2e3acd35ac0f484124def12ee513',canonicalMD5:'f38189a9960f714e43a3ebcbc60f336e',removedExactlyOneTerminalLF:true,installedDefinitionMatched:true};
  await installLearningPrerequisites(db);
  for(const path of['supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql','supabase/migrations/20261020150000_uc_server_custom_journals.sql','supabase/migrations/20261021160000_uc_conducted_sessions.sql'])await db.exec(read(path));
  for(const signature of['read_group_education_facts(uuid,uuid,jsonb)','read_learning_outcome(uuid,jsonb)','read_custom_journals(uuid,jsonb)','read_conducted_sessions(uuid,uuid,jsonb)','account_deletion_erase_data(uuid,text)'])if(!(await one(db,'SELECT to_regprocedure($1)id',['public.'+signature])).id)throw Error('Combined public/private stack missing: '+signature);
  const privacy=(await one(db,"SELECT pg_get_functiondef('account_deletion_erase_data(uuid,text)'::regprocedure)d")).d;
  for(const call of['DELETE FROM public.organization_monthly_student_assignments WHERE user_id=u;','DELETE FROM public.organization_monthly_training_completions WHERE user_id=u;','public.uc_erase_group_education_facts(u)','public.uc_learning_erase_user(u)','public.uc_custom_journal_erase_user(u)','public.uc_session_erase_user(u)'])if(!privacy.includes(call))throw Error('Full privacy workflow lacks exact hook: '+call);
  return db;
 }catch(e){await db.close();throw e;}
}

export async function seedFullCycle(db:FullCycleDb){
 const learning=await seedLearningScenario(db as any);
 // Nonempty old rows are deliberate preservation witnesses. They do not imply
 // legal issuance, recognition or a completed enrollment, and belong to another
 // synthetic subject so target erasure must retain them exactly.
 await db.exec('RESET ROLE');const oldJournal=randomUUID(),oldEntry=randomUUID();
 await db.query("INSERT INTO journal_instances(id,organization_id,course_id,journal_type,title)VALUES($1,$2,$3,'custom_full_cycle_legacy','Synthetic untouched legacy journal')",[oldJournal,lo.org,lo.course]);
 await db.query("INSERT INTO journal_entries(id,journal_id,user_id,entry_type,value,notes)VALUES($1,$2,$3,'grade','04','Synthetic retained legacy note')",[oldEntry,oldJournal,lo.otherStudent]);
 const request=()=>randomUUID();
 const groupRead=async(query:any={kind:'state'},connection:any=db,group=lo.group)=>(await one(connection,'SELECT read_group_education_facts($1,$2,$3)d',[lo.org,group,JSON.stringify(query)])).d;
 const groupApply=async(revision:number,action:any,connection:any=db)=>(await one(connection,'SELECT apply_group_education_facts_action($1,$2,$3,$4,$5)d',[lo.org,lo.group,revision,request(),JSON.stringify(action)])).d;
 await learningAs(db as any,lo.owner);
 let state=await groupRead();
 await groupApply(0,{action:'initialize_history',timezone:'UTC',expected_program_ref:state.program_ref,reason:'Synthetic combined observed membership starts now'});
 state=await groupRead();
 const date=(await one(db,"SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text d")).d;
 const saved=await groupApply(state.state.revision,{action:'save_calendar_version',base_version_id:null,expected_program_ref:state.program_ref,timezone:'UTC',planned_start_date:date,planned_end_date:date,coverage:'whole_program',partial_reason:null,lessons:[{lesson_id:null,local_date:date,starts_at:null,ends_at:null,topic:'Synthetic actual conducted session',module_label:null,course_lesson_id:null,academic_hours:'16',teacher_user_id:lo.teacher,status:'planned',cancellation_reason:null}],reason:'Synthetic explicit 16 academic-hour plan'});
 let calendar=(await groupRead({kind:'calendar',selection:{kind:'current',view:'draft'}})).calendar;
 await groupApply(saved.envelope.state.revision,{action:'publish_calendar_version',version_id:calendar.id,expected_content_hash:calendar.content_hash,expected_program_ref:saved.envelope.state.program_ref,reason:'Synthetic reviewed calendar publication'});
 state=await groupRead();calendar=(await groupRead({kind:'calendar',selection:{kind:'current',view:'published'}})).calendar;
 const retained=await groupApply(state.state.revision,{action:'capture_roster_snapshot',as_of:{kind:'current'},knowledge_revision:state.state.revision,calendar_version_id:calendar.id,expected_calendar_hash:calendar.content_hash,expected_program_ref:state.program_ref,purpose:'lesson_roster',reason:'Synthetic exact lesson roster observed now'});
 await db.exec('RESET ROLE');
 const times=await one(db,"SELECT to_char(as_of AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')starts_at,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')ends_at FROM uc_group_roster_snapshots WHERE id=$1",[retained.receipt.snapshot_id]);
 await learningAs(db as any,lo.owner);
 const confirmAction={action:'confirm_session',calendar_version_id:calendar.id,calendar_hash:calendar.content_hash,lesson_id:calendar.lessons[0].lesson_id,snapshot_id:retained.receipt.snapshot_id,starts_at:times.starts_at,ends_at:times.ends_at,academic_hours:'16',teacher_user_id:lo.teacher,attendance:[{user_id:lo.student,status:'present'}],reason:'Synthetic human-confirmed attendance, no progress inference',human_attested:true};
 const sessionApply=async(revision:number,action:any,requestId=request(),connection:any=db,group=lo.group)=>(await one(connection,'SELECT apply_conducted_session_action($1,$2,$3,$4,$5)d',[lo.org,group,revision,requestId,JSON.stringify(action)])).d;
 const sessionRead=async(query:any,connection:any=db,group=lo.group)=>(await one(connection,'SELECT read_conducted_sessions($1,$2,$3)d',[lo.org,group,JSON.stringify(query)])).d;
 const confirm=()=>sessionApply(0,confirmAction);
 const decideAction=(current:any,extra:any={})=>({action:current.last_decision?'supersede_decision':'record_attestation_decision',scope:learning.scope,expected_revision:current.revision,criteria_ref:current.criteria_ref,machine_result_id:current.machine.id,expected_machine_input_hash:current.machine.input_hash,expected_decision_id:current.last_decision?.id??null,outcome:'passed',basis:'machine',staff_reason:'Synthetic private human rationale',learner_summary:'Synthetic result for learner',reviewed_current_component_ids:[],recognized_component_ids:[],recognition_file_version_id:null,...extra});
 const evaluate=async()=>{await learning.criteria();const attempt=await learning.attempt(16,20);await learningAs(db as any,lo.owner);const captured=await learning.capture();const decision=await learning.action(decideAction(captured.current));return {attempt,captured,decision};};
 const draftAction=(receipt:any,kind='journal',expected=0)=>({action:'create_draft',session_id:receipt.session_id,expected_content_hash:receipt.content_hash,kind,expected_draft_revision:expected,student_ids:[lo.student],reason:'Synthetic draft with exact independent evidence',human_review_required:true});
 return {db,learning,request,groupRead,groupApply,calendar,retained,confirmAction,sessionApply,sessionRead,confirm,evaluate,decideAction,draftAction};
}

export async function legacyRows(db:FullCycleDb){
 await db.exec('RESET ROLE');const proof:any={};
 for(const table of['enrollments','lesson_progress','test_attempt_sessions','test_attempts','course_manual_credits','org_documents','education_document_records','group_documents','journal_instances','journal_entries']){
  if(!(await one(db,'SELECT to_regclass($1)id',['public.'+table])).id)throw Error('Actual old relation unavailable: '+table);
  proof[table]=(await one(db,`SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY to_jsonb(x)::text),'[]')d FROM ${table} x`)).d;
 }
 await caller(db,lo.owner);return proof;
}

export async function prepareTrustedErase(db:FullCycleDb,user:string){
 await db.exec('RESET ROLE');
 const files=(await one(db,'SELECT account_deletion_files($1)d',[user])).d;
 await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[user]);
 const job=randomUUID(),receipt='synthetic-combined-native-'+job;
 await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,$2,'full-personal-data-v1','cleanup_pending',$3,'{}',$4,false)",[job,receipt,user,JSON.stringify(files)]);
 return {job,receipt};
}
export async function trustedErase(connection:any,job:{job:string;receipt:string}){
 // Exactly the existing native trusted-worker simulation: original service-NULL
 // claims and SQL owner, with a real validated job. No forged private erase flag.
 await connection.exec('RESET ROLE');await connection.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 return(await one(connection,'SELECT account_deletion_erase_data($1,$2)d',[job.job,job.receipt])).d;
}

/** Root-approved metadata-only read once, after all four installed migrations,
 * before any scenario seed. No product action, data row read, DDL or mutation. */
export async function captureCombinedPortableMetadata(db:FullCycleDb,output:string){
 const queryPath='supabase/tests/fixtures/uc-full-cycle-collect-portable-metadata.sql';
 const queryRaw=readFileSync(queryPath);
 const querySHA256=createHash('sha256').update(queryRaw).digest('hex');
 if(querySHA256!=='57c456606811b5eaf24f0128cd5a6de64ab76ecfc59605b18429af696b33a5ab')throw Error('Exact reviewed metadata collector query required');
 const expectedNewNames=["apply_conducted_session_action","apply_custom_journal_action","apply_group_education_facts_action","apply_learning_outcome_action","read_conducted_sessions","read_custom_journals","read_group_education_facts","read_learning_outcome","uc_custom_journal_allowed","uc_custom_journal_base","uc_custom_journal_detail","uc_custom_journal_erase_user","uc_custom_journal_error","uc_custom_journal_fields","uc_custom_journal_guard","uc_custom_journal_identities","uc_custom_journal_legacy","uc_custom_journal_person","uc_custom_journal_personal_counts","uc_custom_journal_preview","uc_custom_journal_record_json","uc_custom_journal_schema_json","uc_custom_journal_shape","uc_custom_journal_subject","uc_custom_journal_text","uc_custom_journal_text_units","uc_custom_journal_uuid","uc_custom_journal_values","uc_erase_group_education_facts","uc_group_education_actor_allowed","uc_group_education_actor_facts","uc_group_education_append","uc_group_education_authority","uc_group_education_budget_counter","uc_group_education_budget_ticket_guard","uc_group_education_calendar","uc_group_education_calendar_input","uc_group_education_capabilities","uc_group_education_compact_budget_tickets","uc_group_education_correct","uc_group_education_count","uc_group_education_deletion_preview","uc_group_education_envelope","uc_group_education_erasing","uc_group_education_error","uc_group_education_event","uc_group_education_event_complete","uc_group_education_legacy","uc_group_education_lock","uc_group_education_offset","uc_group_education_open_gap","uc_group_education_own_source","uc_group_education_parent_cleanup","uc_group_education_personal_counts","uc_group_education_prerequisite","uc_group_education_program","uc_group_education_program_proof","uc_group_education_public_row","uc_group_education_redact","uc_group_education_retained_program_valid","uc_group_education_roster_context","uc_group_education_scan","uc_group_education_scope","uc_group_education_short_name","uc_group_education_snapshot_page","uc_group_education_source_after","uc_group_education_source_before","uc_group_education_source_fold","uc_group_education_source_observe","uc_group_education_source_queue","uc_group_education_source_relevant","uc_group_education_source_scopes","uc_group_education_source_statement_end","uc_group_education_source_truncate","uc_group_education_teacher_allowed","uc_group_education_valid_zone","uc_group_education_validate_artifact","uc_learning_access","uc_learning_criteria_ref","uc_learning_envelope","uc_learning_erase_user","uc_learning_error","uc_learning_evaluate","uc_learning_guard","uc_learning_ids","uc_learning_observe_session","uc_learning_options","uc_learning_person","uc_learning_personal_counts","uc_learning_programme_proof","uc_learning_recognition_proof","uc_learning_scope","uc_learning_scope_valid","uc_learning_shape","uc_learning_staff","uc_learning_test_component","uc_learning_text","uc_learning_try_people","uc_learning_uuid","uc_learning_validate_criteria","uc_learning_validate_test","uc_session_access","uc_session_erase_user","uc_session_error","uc_session_outcomes","uc_session_personal_counts","uc_session_personal_export","uc_session_redact","uc_session_source","uc_session_version"];
 const expectedOld=["account_deletion_erase_data(uuid,text)","account_deletion_personal_row_counts(uuid)","account_deletion_snapshot(uuid)","uc_guard_program_artifact()"];
 const expectedTables=["public.uc_conducted_session_requests","public.uc_conducted_session_versions","public.uc_conducted_sessions","public.uc_custom_journal_history","public.uc_custom_journal_records","public.uc_custom_journal_requests","public.uc_custom_journal_schemas","public.uc_custom_journals","public.uc_group_calendar_versions","public.uc_group_education_events","public.uc_group_education_requests","public.uc_group_education_states","public.uc_group_roster_snapshots","public.uc_learning_attempt_contexts","public.uc_learning_attestation_decisions","public.uc_learning_criteria_versions","public.uc_learning_machine_results","public.uc_learning_outcome_requests","public.uc_learning_outcome_states","public.uc_session_document_drafts"];
 const expectedSources={"20261019120000_uc_group_education_facts.sql":"b54b161b9670f5e06d80fca10413033b2b800c3cb6b5e519069d05b0b349c07b","20261020140000_uc_learning_outcome_foundation.sql":"aaf22aea94055562f3fcfcf31d97a6bbeb1adad99f96c3d7e94c050d5472d978","20261020150000_uc_server_custom_journals.sql":"c91de9e7586780b1a7cc823f5ea19860e7acd70eab3bbbfddc5be6314ccd15d8","20261021160000_uc_conducted_sessions.sql":"49452c2b93d780b28f0ebe3570db28575efefd4a34eedb46f506da6a7ea13200"};
 let metadata:any;
 await db.exec("RESET ROLE;BEGIN READ ONLY;SET LOCAL search_path=pg_catalog,public;SET LOCAL TIME ZONE 'UTC'");
 try{
  const row=await one<any>(db,queryRaw.toString('utf8'));metadata=row.release_metadata;
  if(metadata?.kind!=='UC013_017_EXACT_COMBINED_PORTABLE_METADATA_V1'||metadata.context.transaction_read_only!=='on'||metadata.context.search_path!=='pg_catalog,public'||metadata.context.timezone!=='UTC'||metadata.context.current_user!=='postgres'||JSON.stringify(metadata.context.resolved_schemas)!==JSON.stringify(['pg_catalog','public']))throw Error('Exact read-only metadata collector context required');
  const identities=metadata.functions.map((f:any)=>f.signature);
  if(identities.length!==114||new Set(identities).size!==114||expectedOld.some((s:string)=>!identities.includes(s)))throw Error('Exact110new+4old metadata identities required');
  const newNames=metadata.functions.filter((f:any)=>!expectedOld.includes(f.signature)).map((f:any)=>f.signature.split('(')[0]).sort();
  if(JSON.stringify(newNames)!==JSON.stringify(expectedNewNames))throw Error('Exact110 reviewed new-function names required');
  if(JSON.stringify(metadata.tables.map((t:any)=>t.schema+'.'+t.name).sort())!==JSON.stringify(expectedTables))throw Error('Exact20new table identities required');
  if(JSON.stringify(Object.keys(metadata.migration_source_sha256).sort())!==JSON.stringify(Object.keys(expectedSources).sort())||Object.entries(expectedSources).some(([p,h])=>metadata.migration_source_sha256[p]!==h))throw Error('Exact4migration source hashes required');
 }finally{await db.exec('ROLLBACK');}
 const file='combined-portable-metadata.json';const payload=Buffer.from(JSON.stringify({rows:[{release_metadata:metadata}]},null,2)+'\n');
 writeFileSync(join(output,file),payload,{flag:'wx'});
 return {kind:'combined_portable_metadata',file,sha256:createHash('sha256').update(payload).digest('hex'),querySHA256,functions:114,newFunctions:110,oldFunctions:4,tables:20,transactionReadOnly:true,customerRowsRead:false,preseed:true};
}

/** Metadata-only stage51 snapshot once before UC014; prepare validates the
 * retained historical111 fingerprints. Collection never relaxes those guards. */
export async function captureStage51PrepareMetadata(db:FullCycleDb,output:string){
 const raw=readFileSync('supabase/tests/fixtures/uc-full-cycle-collect-stage51-metadata.sql');
 const querySHA256=createHash('sha256').update(raw).digest('hex');
 if(querySHA256!=='ed62ee05ef172164d0023f69d94ef3db436cedc72bcc0afb4d2218f97f2a8cc8')throw Error('Exact reviewed stage51 metadata collector required');
 const keys=["expectedFunctions","expectedChangedFunctions","expectedTables","expectedPolicies","expectedTriggers","expectedLegacyShapes","expectedNewConstraints"];let metadata:any;
 await db.exec("RESET ROLE;BEGIN READ ONLY;SET LOCAL search_path=pg_catalog,public;SET LOCAL TIME ZONE 'UTC'");
 try{
  if((await one<any>(db,"SELECT current_setting('transaction_read_only')readonly")).readonly!=='on')throw Error('Actual read-only stage51 context required');
  metadata=(await one<any>(db,raw.toString('utf8'))).stage51_metadata;
  if(metadata?.kind!=='UC013_STAGE51_NATIVE_PREPARE_METADATA_V1'||metadata.context.search_path!=='pg_catalog,public'||metadata.context.timezone!=='UTC'||metadata.context.current_user!=='postgres'||metadata.context.database!==db.native.name||JSON.stringify(metadata.context.resolved_schemas)!==JSON.stringify(['pg_catalog','public']))throw Error('Exact stage51 metadata context required');
  if(keys.some((key:string)=>!Array.isArray(metadata[key]))||metadata.expectedFunctions.length!==51||new Set(metadata.expectedFunctions.map((f:any)=>f.signature)).size!==51||metadata.expectedChangedFunctions.length!==4||metadata.expectedTables.length!==5||metadata.expectedLegacyShapes.length!==2||metadata.expectedNewConstraints.length!==8)throw Error('Exact stage51 seven-array inventory required');
  if(JSON.stringify(metadata.expectedFunctions.map((f:any)=>f.signature.split('(')[0]).sort())!==JSON.stringify(["apply_group_education_facts_action","read_group_education_facts","uc_erase_group_education_facts","uc_group_education_actor_allowed","uc_group_education_actor_facts","uc_group_education_append","uc_group_education_authority","uc_group_education_budget_counter","uc_group_education_budget_ticket_guard","uc_group_education_calendar","uc_group_education_calendar_input","uc_group_education_capabilities","uc_group_education_compact_budget_tickets","uc_group_education_correct","uc_group_education_count","uc_group_education_deletion_preview","uc_group_education_envelope","uc_group_education_erasing","uc_group_education_error","uc_group_education_event","uc_group_education_event_complete","uc_group_education_legacy","uc_group_education_lock","uc_group_education_offset","uc_group_education_open_gap","uc_group_education_own_source","uc_group_education_parent_cleanup","uc_group_education_personal_counts","uc_group_education_prerequisite","uc_group_education_program","uc_group_education_program_proof","uc_group_education_public_row","uc_group_education_redact","uc_group_education_retained_program_valid","uc_group_education_roster_context","uc_group_education_scan","uc_group_education_scope","uc_group_education_short_name","uc_group_education_snapshot_page","uc_group_education_source_after","uc_group_education_source_before","uc_group_education_source_fold","uc_group_education_source_observe","uc_group_education_source_queue","uc_group_education_source_relevant","uc_group_education_source_scopes","uc_group_education_source_statement_end","uc_group_education_source_truncate","uc_group_education_teacher_allowed","uc_group_education_valid_zone","uc_group_education_validate_artifact"]))throw Error('Exact51 stage51 function names required');
  if(metadata.migration_source_sha256!=='b54b161b9670f5e06d80fca10413033b2b800c3cb6b5e519069d05b0b349c07b')throw Error('Exact stage51 raw migration source required');
 }finally{await db.exec('ROLLBACK');}
 const file='stage51-native-metadata.json';const payload=Buffer.from(JSON.stringify({rows:[{stage51_metadata:metadata}]},null,2)+'\n');writeFileSync(join(output,file),payload,{flag:'wx'});
 return {kind:'stage51_prepare_metadata',file,sha256:createHash('sha256').update(payload).digest('hex'),querySHA256,arrays:7,functions:51,changedFunctions:4,tables:5,legacyShapes:2,newConstraints:8,transactionReadOnly:true,customerRowsRead:false,beforeUC014:true,preseed:true};
}
