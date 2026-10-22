// Source only. Root runs exactly this suite only after complete source/profile freeze.
import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {verifyScopedJournalExport} from '@/lib/customJournals/scopedExport';
import {createScopedFixture,caller,one,lo,notes,none,group,organization,sideTables,sha,scopeRead,scopeAction,oldRead,oldAction,dataDigests,journalRows,outcomeRows,prepareTrustedErase,trustedErase,type FullCycleDb} from './scoped-journals.fixture';
export const SCOPED_CASES=[
 ['SJ01','old v1 data schemas source metadata and private privileges survive additive scoped journals'],
 ['SJ02','current teacher group tenant and actor checks prevent scoped and organization journal leaks'],
 ['SJ03','authoritative session and outcome references never rewrite confirmed attendance or human decisions'],
 ['SJ04','explicit nonpersonal rows keep typed values own schema labels and immutable correction history'],
 ['SJ05','frozen export contains all51 records every history page and exact escaped UTF8 artifact bytes'],
 ['SJ06','two PostgreSQL sessions fence concurrent record writers and export capture without mixed snapshots'],
 ['SJ07','record schema and archive changes preserve prior frozen exports and current replay authority'],
 ['SJ08','full trusted subject and author erasure removes copied artifacts preserves unrelated rows and never refunds usage'],
 ['SJ09','oversized complete export refuses without truncation partial rows or privilege changes'],
 ['SJ10','ordinary groups without a course or approved programme keep notes and exact retained contexts'],
]as const;
const output=process.env.UC116_NATIVE_OUTPUT;if(!output)throw Error('Explicit isolated native output required');
const recorded:any[]=[];const persist=()=>writeFileSync(join(output,'scoped-journals-cases.json'),JSON.stringify({status:recorded.length===10&&recorded.every(c=>c.status==='PASS')?'PASS':'INCOMPLETE_OR_FAILED',expectedCases:10,scope:'Actual isolated PostgreSQL17 and synthetic SQL role/claims. Not real Auth/browser/customer acceptance.',cases:recorded},null,2)+'\n');
type Fixture=Awaited<ReturnType<typeof createScopedFixture>>;
type Ctx=Fixture&{note(x:any):void};
function register(index:number,run:(c:Ctx)=>Promise<void>){const[id,title]=SCOPED_CASES[index];it(id+' '+title,async()=>{
 const record:any={id,title,status:'RUNNING',facts:[],startedAtUtc:new Date().toISOString()};recorded.push(record);persist();let f:Fixture|undefined;
 try{f=await createScopedFixture(index===0,index===0);record.database=f.db.native.name;record.facts.push({kind:'installed_uc013_stage',...(f.db as any).__ucFullCycleSourceProof});record.facts.push({kind:'append615_preservation',oldTableCount:Object.keys(f.beforeData).length,oldDataSHA256:sha(JSON.stringify(f.beforeData)),oldDataUnchanged:true,oldFunctionsUnchangedExceptFourSources:true,newFunctions:f.nativeCatalog.newFunctions.length,oldFour:f.nativeCatalog.oldFour.map((x:any)=>({signature:x.signature,sourceMD5:x.source_md5}))});await run({...f,note(x){if(record.facts.length>150||JSON.stringify(x).length>200000)throw Error('Bounded evidence exceeded');record.facts.push(x);}});record.status='PASS';}
 catch(error:any){record.status='FAIL';record.failure={code:error?.code,message:String(error?.message??error).slice(0,4000)};throw error;}
 finally{try{if(f)await f.db.close();record.fixtureClosed=true;}catch(error:any){record.status='FAIL';record.cleanupFailure=String(error);throw error;}finally{record.finishedAtUtc=new Date().toISOString();persist();}}
},240000);}
async function denied(fn:()=>Promise<any>,code:string,sqlState?:string){let failure:any;try{await fn();}catch(error){failure=error;}expect(failure,'Actual product RPC must refuse '+code).toBeTruthy();expect(String(failure.message)).toContain(code);if(sqlState)expect(failure.code).toBe(sqlState);return failure;}
async function noPartial(c:Ctx,fn:()=>Promise<any>,code:string){const before=await dataDigests(c.db);await caller(c.db,lo.owner);const error=await denied(fn,code);expect(await dataDigests(c.db)).toEqual(before);await caller(c.db,lo.owner);c.note({kind:'actual_refusal',code:error.code,message:String(error.message).slice(0,160),noPartialRows:true});}
const recordPage=(journal:string,after:string|null=null)=>({kind:'records',journal_id:journal,after_id:after,limit:25});
const historyPage=(journal:string,record:string,after=0)=>({kind:'history',journal_id:journal,record_id:record,after_revision:after,limit:25});
async function allRecords(c:Ctx,journal:string,context:any=group){const rows:any[]=[];const sizes:number[]=[];let after:string|null=null;for(let page=0;page<41;page++){const value=await c.read(context,recordPage(journal,after));rows.push(...value.records);sizes.push(value.records.length);after=value.next_after_id;if(!after)return{rows,sizes};}throw Error('Complete bounded record pagination failed');}
async function allHistory(c:Ctx,journal:string,record:string,context:any=group){const rows:any[]=[];let after=0;for(let page=0;page<401;page++){const value=await c.read(context,historyPage(journal,record,after));rows.push(...value.history);if(value.next_after_revision===null)return rows;after=value.next_after_revision;}throw Error('Complete bounded history pagination failed');}
async function capture(c:Ctx,journal:any,context:any=group,request?:string,connection:any=c.db){return c.act(context,{action:'capture_export',journal_id:journal.id},journal.revision,request,connection);}
async function verified(c:Ctx,exported:any,context:any=group){const read=await c.read(context,{kind:'export',journal_id:exported.journal.id,export_id:exported.export.id});expect(read.export).toEqual(exported.export);const value=await verifyScopedJournalExport(read.export,{organizationId:lo.org,journalId:exported.journal.id,context:exported.journal.context,exportId:exported.export.id},()=>true);expect(sha(Buffer.from(value.manifestText,'utf8'))).toBe(exported.export.manifest_hash);expect(sha(Buffer.from(value.htmlText,'utf8'))).toBe(exported.export.html_hash);return value;}

register(0,async c=>{
 expect(await journalRows(c.db,c.old.journal.id,false)).toEqual(c.oldWitness);await c.db.exec('RESET ROLE');for(const table of sideTables)expect(Number((await one(c.db,'SELECT count(*)n FROM public.'+table)).n)).toBe(0);await caller(c.db,lo.owner);
 expect((await oldRead(c.db,{kind:'journal',journal_id:c.old.journal.id})).journal.id).toBe(c.old.journal.id);
 const made=await c.create();const row=await c.save(made.journal,{notes:'Scoped retained subject row'});
 expect((await oldRead(c.db,{kind:'list',after_id:null,limit:50,include_archived:true})).journals.map((x:any)=>x.id)).not.toContain(made.journal.id);
 for(const query of[{kind:'journal',journal_id:made.journal.id},recordPage(made.journal.id),historyPage(made.journal.id,row.record.id)])await denied(()=>oldRead(c.db,query),'CUSTOM_JOURNAL_NOT_FOUND');
 await denied(()=>oldAction(c.db,{action:'archive_journal',journal_id:made.journal.id,archived:true,reason:'Cannot use old API'},1),'CUSTOM_JOURNAL_NOT_FOUND');
 await c.db.exec('RESET ROLE');expect((await one(c.db,"SELECT attnotnull FROM pg_attribute WHERE attrelid='public.uc_custom_journal_records'::regclass AND attname='subject_user_id'")).attnotnull).toBe(true);
 for(const role of ['authenticated','anon','service_role']){await caller(c.db,role==='authenticated'?lo.owner:null,role);for(const table of sideTables){await denied(()=>c.db.query('SELECT * FROM public.'+table),'permission denied','42501');await denied(()=>c.db.query('DELETE FROM public.'+table+' WHERE false'),'permission denied','42501');}}
 await c.db.exec('RESET ROLE');const acl=(await c.db.query<any>("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)owner,(SELECT count(*)FROM pg_policy p WHERE p.polrelid=c.oid)policies,EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner)extra_acl FROM pg_class c WHERE c.oid=ANY($1::regclass[])ORDER BY c.relname",[sideTables.map(t=>'public.'+t)])).rows;
 expect(acl).toHaveLength(5);for(const r of acl){expect(r.relrowsecurity).toBe(true);expect(r.relforcerowsecurity).toBe(false);expect(Number(r.policies)).toBe(0);expect(r.extra_acl).toBe(false);expect(r.owner).toBe('postgres');}
 for(const f of c.nativeCatalog.newFunctions)for(const role of ['authenticated','anon','service_role']){const privilege=await one(c.db,"SELECT has_function_privilege($1,$2,'EXECUTE')allowed",[role,'public.'+f.signature]);expect(privilege.allowed).toBe(role==='authenticated'&&/^(read_scoped_custom_journals|apply_scoped_custom_journal_action)\(/.test(f.signature));}
 c.note({kind:'old_v1_and_private_acl',oldRowsEqual:true,newContextHidden:true,oldSubjectNotNull:true,hostileDefaultsStrippedOnlyNewObjects:true,newTables:5,threeDirectRolesRefused:true});
});
register(1,async c=>{
 const made=await c.create();await c.save(made.journal,{notes:'One exact group subject'});await caller(c.db,lo.teacher);
 expect((await c.read(group,{kind:'journal',journal_id:made.journal.id})).capabilities.can_write).toBe(true);
 const subjects=await c.read(group,{kind:'subjects',journal_id:made.journal.id,after_id:null,limit:50});expect(subjects.subjects.map((x:any)=>x.user_id)).toEqual([lo.student]);
 await denied(()=>c.read(organization,{kind:'list',after_id:null,limit:50,include_archived:false}),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await denied(()=>c.read({kind:'group',group_id:lo.otherGroup},{kind:'journal',journal_id:made.journal.id}),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await denied(()=>scopeRead(c.db,group,{kind:'journal',journal_id:made.journal.id},lo.foreign),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await c.db.exec('RESET ROLE');const foreign=(await c.db.query<any>('SELECT id FROM organizations WHERE id=$1',[lo.foreign])).rows;expect(foreign).toHaveLength(1);
 await caller(c.db,lo.teacher);const request=randomUUID(),exported=await capture(c,made.journal,group,request);
 await caller(c.db,lo.owner);await c.db.exec('RESET ROLE');await c.db.query("UPDATE org_staff SET sections_access=sections_access-'journals.write' WHERE user_id=$1",[lo.teacher]);await caller(c.db,lo.teacher);
 expect((await c.read(group,{kind:'journal',journal_id:made.journal.id})).capabilities.can_write).toBe(false);expect((await capture(c,made.journal)).export.id).toBeTruthy();
 await denied(()=>c.save(made.journal,{notes:'Read-only cannot write'}),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await caller(c.db,lo.owner);await c.db.exec('RESET ROLE');await c.db.query('DELETE FROM org_staff_document_groups WHERE staff_id=$1 AND group_id=$2',[lo.teacherStaff,lo.group]);await caller(c.db,lo.teacher);
 for(const query of [{kind:'journal',journal_id:made.journal.id},{kind:'export',journal_id:made.journal.id,export_id:exported.export.id}])await denied(()=>c.read(group,query),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await denied(()=>capture(c,made.journal,group,request),'CUSTOM_JOURNAL_ACCESS_DENIED');
 await caller(c.db,lo.owner);await c.db.exec('RESET ROLE');await c.db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[lo.teacher]);await caller(c.db,lo.teacher);await denied(()=>c.read(group,{kind:'list',after_id:null,limit:50,include_archived:false}),'CUSTOM_JOURNAL_ACCESS_DENIED');
 c.note({kind:'current_scope_authority',onlyGroupLearnerListed:true,otherGroupAndTenantDenied:true,readOnlyCaptureAccepted:true,readOnlyWriteDenied:true,removedAssignmentReadAndReplayDenied:true,revokedActorDenied:true});
});
register(2,async c=>{
 const session=await c.s.confirm();const evaluated=await c.s.evaluate();const made=await c.create();const before=await outcomeRows(c.db);await caller(c.db,lo.owner);
 const sessions=await c.read(group,{kind:'sources',journal_id:made.journal.id,source_kind:'session',subject_user_id:lo.student,after_id:null,limit:25});const outcomes=await c.read(group,{kind:'sources',journal_id:made.journal.id,source_kind:'outcome',subject_user_id:lo.student,after_id:null,limit:25});expect(sessions.sources).toHaveLength(1);expect(outcomes.sources).toHaveLength(1);
 const sessionSource=sessions.sources[0].source,outcomeSource=outcomes.sources[0].source;
 expect(sessionSource.session_id).toBe(session.receipt.session_id);expect(outcomeSource.decision_id).toBe(evaluated.decision.current.last_decision.id);
 await c.save(made.journal,{notes:'Manual note referring to exact conducted source'},undefined,sessionSource);await c.save(made.journal,{notes:'Manual note referring to exact separate human decision'},undefined,outcomeSource);
 for(const bad of [{...sessionSource,content_hash:'0'.repeat(64)},{...sessionSource,session_version_id:randomUUID()},{...outcomeSource,machine_input_hash:'0'.repeat(64)},{...outcomeSource,decision_id:randomUUID()}])await noPartial(c,()=>c.save(made.journal,{notes:'Forged reference'},undefined,bad),'CUSTOM_JOURNAL_SOURCE_UNAVAILABLE');
 const organizationJournal=await c.create(organization);await noPartial(c,()=>c.save(organizationJournal.journal,{notes:'No source in org context'},undefined,sessionSource,null,organization),'CUSTOM_JOURNAL_INVALID_INPUT');
 expect(await outcomeRows(c.db)).toEqual(before);await caller(c.db,lo.owner);
 const correction={action:'correct_attendance',session_id:session.receipt.session_id,expected_content_hash:session.receipt.content_hash,attendance:[{user_id:lo.student,status:'excused'}],reason:'Synthetic real correction makes original reference stale',human_attested:true};await c.s.sessionApply(session.receipt.revision,correction);
 const all=await allRecords(c,made.journal.id);expect(all.rows.find(r=>r.source.kind==='session').source_current).toBe(false);
 const exported=await capture(c,made.journal);const checked=await verified(c,exported);expect(checked.htmlText).toContain('изменился или недоступен на момент снимка');
 c.note({kind:'authoritative_sources',sessionId:session.receipt.session_id,decisionId:outcomeSource.decision_id,forgedSourcesRefused:4,journalActionsDidNotMutateResult:true,correctedSessionShownStale:true});
});
register(3,async c=>{
 const made=await c.create(organization);let journal=made.journal;const initial=await c.save(journal,{notes:'Original nonpersonal value'},none,none,null,organization);expect(initial.record.subject).toEqual(none);expect(initial.record.subject_label).toBeNull();
 const rename=await c.act(organization,{action:'save_schema',journal_id:journal.id,title:journal.title,description:journal.description,fields:[{...notes[0],label:'Renamed <&"notes>'},{id:'topic',label:'New topic',type:'text',semantic:'topic'}],reason:'Synthetic explicit schema change'},journal.revision);journal=rename.journal;
 const corrected=await c.save(journal,{notes:'Corrected nonpersonal value',topic:'Technical event'},none,none,initial.record,organization);expect(corrected.record.revision).toBe(2);
 const removed=await c.act(organization,{action:'save_schema',journal_id:journal.id,title:journal.title,description:journal.description,fields:[{id:'topic',label:'Current topic only',type:'text',semantic:'topic'}],reason:'Synthetic removal keeps old row schema'},journal.revision);journal=removed.journal;
 const history=await allHistory(c,journal.id,initial.record.id,organization);expect(history).toHaveLength(2);expect(history[0].schema.fields[0].label).toBe(notes[0].label);expect(history[0].values).toEqual({notes:'Original nonpersonal value'});expect(history[1].schema.fields[0].label).toBe('Renamed <&"notes>');expect((await allRecords(c,journal.id,organization)).rows[0].schema_version_id).toBe(corrected.record.schema_version_id);
 const identity=await c.create(organization,[{id:'full_name',label:'Name',type:'text',semantic:'full_name'}]);await noPartial(c,()=>c.save(identity.journal,{full_name:'Undeclared person'},none,none,null,organization),'CUSTOM_JOURNAL_INVALID_INPUT');
 await noPartial(c,()=>c.save(journal,{topic:'Retarget cannot occur'},{kind:'person',user_id:lo.student},none,corrected.record,organization),'CUSTOM_JOURNAL_INVALID_INPUT');
 const archived=await c.act(organization,{action:'archive_record',journal_id:journal.id,record_id:corrected.record.id,archived:true,reason:'Synthetic archive retains history'},corrected.record.revision);expect(archived.record.archived).toBe(true);expect(await allHistory(c,journal.id,corrected.record.id,organization)).toHaveLength(3);
 c.note({kind:'nonpersonal_schema_history',subjectNone:true,oldLabelsAndValuesRetained:true,immutableSubject:true,identityFieldWithoutPersonDenied:true,archiveRevision:3});
});
register(4,async c=>{
 const made=await c.create(organization);const ids:string[]=[];let first:any;
 for(let index=0;index<51;index++){const row=await c.save(made.journal,{notes:'Synthetic row '+index+' <script>alert("QA")</script> & only text'},none,none,null,organization);ids.push(row.record.id);if(index===0)first=row.record;}
 for(let revision=1;revision<28;revision++)first=(await c.save(made.journal,{notes:'Synthetic history revision '+(revision+1)+' <&>'},none,none,first,organization)).record;
 const page=await allRecords(c,made.journal.id,organization);expect(page.sizes).toEqual([25,25,1]);expect(page.rows.map(r=>r.id)).toEqual([...ids].sort());expect(await allHistory(c,made.journal.id,first.id,organization)).toHaveLength(28);
 const exported=await capture(c,made.journal,organization);const checked=await verified(c,exported,organization);expect(checked.manifest.records).toHaveLength(51);expect(checked.manifest.records.map(r=>r.id)).toEqual([...ids].sort());expect(checked.manifest.records.find(r=>r.id===first.id)!.history).toHaveLength(28);
 expect(checked.htmlText).toContain('&lt;script&gt;');expect(checked.htmlText).not.toMatch(/<script\b|<iframe\b|<img\b|\son\w+\s*=|https?:\/\//i);expect(checked.htmlText).toContain('не электронная подпись');
 c.note({kind:'complete_frozen_export',records:51,recordPageSizes:page.sizes,historyRevisions:28,manifestHash:exported.export.manifest_hash,htmlHash:exported.export.html_hash,actualClientVerifier:true,allRowsAndHistoryExact:true});
});
register(5,async c=>{
 const made=await c.create(organization);const row=await c.save(made.journal,{notes:'Before concurrent correction'},undefined,none,null,organization);const secondary=c.db.native.connect('scoped_race');
 const pids=[c.db.native.record.connections[0].pid,await secondary.pid()];expect(pids[0]).not.toBe(pids[1]);await caller(secondary,lo.reviewer);
 await c.db.exec('BEGIN');let changed:any;
 try{await caller(c.db,lo.owner);changed=await c.save(made.journal,{notes:'Uncommitted correction'},undefined,none,row.record,organization);await denied(()=>capture(c,made.journal,organization,undefined,secondary),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');}finally{await c.db.exec('COMMIT');}
 await caller(secondary,lo.reviewer);const post=await capture(c,made.journal,organization,undefined,secondary);expect(JSON.parse(post.export.manifest_text).records[0].revision).toBe(2);
 await caller(c.db,lo.owner);await c.db.exec('BEGIN');let frozen:any;
 try{frozen=await capture(c,made.journal,organization);await denied(()=>c.act(organization,{action:'save_record',journal_id:made.journal.id,record_id:changed.record.id,schema_version_id:made.journal.current_schema_id,subject:{kind:'person',user_id:lo.student},source:none,values:{notes:'Competing writer'},reason:'Synthetic concurrent correction'},changed.record.revision,undefined,secondary),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');}finally{await c.db.exec('COMMIT');}
 await caller(secondary,lo.reviewer);await c.act(organization,{action:'save_record',journal_id:made.journal.id,record_id:changed.record.id,schema_version_id:made.journal.current_schema_id,subject:{kind:'person',user_id:lo.student},source:none,values:{notes:'Committed later correction'},reason:'Synthetic later correction'},changed.record.revision,undefined,secondary);
 await caller(c.db,lo.owner);expect((await c.read(organization,{kind:'export',journal_id:made.journal.id,export_id:frozen.export.id})).export).toEqual(frozen.export);
 await c.db.exec('RESET ROLE');const waiters=await one(c.db,'SELECT pg_blocking_pids($1)blocked',[pids[1]]);expect(waiters.blocked).toEqual([]);
 const actualFences:any[]=[];await caller(c.db,lo.reviewer);
 for(const person of [lo.student,lo.owner]){
  await secondary.exec('RESET ROLE;BEGIN');try{
   await secondary.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42007))',[person]);
   actualFences.push(...(await c.db.query<any>("SELECT pid,locktype,mode,granted,classid::text,objid::text FROM pg_locks WHERE pid=$1 AND locktype='advisory'AND granted",[pids[1]])).rows);
   if(person===lo.student){await denied(()=>c.read(organization,recordPage(made.journal.id)),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');await denied(()=>c.read(organization,historyPage(made.journal.id,row.record.id)),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');}
   else{await denied(()=>c.read(organization,{kind:'list',after_id:null,limit:50,include_archived:true}),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');await denied(()=>c.read(organization,{kind:'journal',journal_id:made.journal.id}),'CUSTOM_JOURNAL_REVISION_CONFLICT','40001');}
  }finally{await secondary.exec('ROLLBACK');}
 }
 expect(actualFences.length).toBeGreaterThanOrEqual(2);
 c.note({kind:'native_writer_export_fences',backendPids:pids,actualPrivacyFences:actualFences,independentNativeSessions:true,writerBlocksExport:true,exportBlocksWriter:true,readErasureSubjectAndAuthorFence:true,completeCommittedSnapshot:true,oldFrozenBytesUnchanged:true,noBlockedWaiters:true});
});
register(6,async c=>{
 const made=await c.create(organization);const row=await c.save(made.journal,{notes:'First exact artifact'},none,none,null,organization);const request=randomUUID();const old=await capture(c,made.journal,organization,request);const first=await verified(c,old,organization);
 const changed=await c.save(made.journal,{notes:'Second live revision'},none,none,row.record,organization);expect(changed.journal.revision).toBe(made.journal.revision);const newer=await capture(c,made.journal,organization);expect(newer.export.id).not.toBe(old.export.id);expect(newer.export.manifest_hash).not.toBe(old.export.manifest_hash);
 const replay=await capture(c,made.journal,organization,request);expect(replay.receipt.replayed).toBe(true);expect(replay.export).toEqual(old.export);
 await c.act(organization,{action:'archive_record',journal_id:made.journal.id,record_id:changed.record.id,archived:true,reason:'Synthetic archive after snapshot'},changed.record.revision);
 const renamed=await c.act(organization,{action:'save_schema',journal_id:made.journal.id,title:'Later title',description:'Later description',fields:[{...notes[0],label:'Later label'}],reason:'Synthetic change after snapshot'},made.journal.revision);
 const latest=await c.read(organization,{kind:'export',journal_id:made.journal.id,export_id:old.export.id});expect(latest.export).toEqual(old.export);const checked=await verifyScopedJournalExport(latest.export,{organizationId:lo.org,journalId:made.journal.id,context:old.journal.context,exportId:old.export.id},()=>true);expect(checked.manifestText).toBe(first.manifestText);expect(checked.htmlText).toBe(first.htmlText);
 await expect(verifyScopedJournalExport(latest.export,{organizationId:lo.org,journalId:made.journal.id,context:old.journal.context,exportId:old.export.id},()=>false)).rejects.toThrow('ACCESS_DENIED');
 await noPartial(c,()=>c.act(organization,{action:'capture_export',journal_id:made.journal.id},renamed.journal.revision,request),'CUSTOM_JOURNAL_REQUEST_CONFLICT');
 c.note({kind:'frozen_immutability_and_replay',oldExportId:old.export.id,newExportId:newer.export.id,rowRevisionDoesNotIdentifyExport:true,laterSchemaAndArchiveCannotChangeOldBytes:true,exactReplay:true,staleClientDownloadRefused:true});
});
register(7,async c=>{
 const made=await c.create(organization);await c.save(made.journal,{notes:'Declared student copied marker'},undefined,none,null,organization);await c.save(made.journal,{notes:'Unrelated other subject retained'},{kind:'person',user_id:lo.otherStudent},none,null,organization);const artifact=await capture(c,made.journal,organization);
 await c.db.exec('RESET ROLE');const usage=(await one(c.db,"SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY organization_id,month_start),'[]')rows FROM organization_monthly_course_usage t")).rows;
 const before=await dataDigests(c.db);await c.db.exec('BEGIN');try{const job=await prepareTrustedErase(c.db,lo.student);expect(await trustedErase(c.db,job)).toEqual({erased:true});}finally{await c.db.exec('ROLLBACK');}expect(await dataDigests(c.db)).toEqual(before);
 const job=await prepareTrustedErase(c.db,lo.student);const counts=JSON.stringify((await one(c.db,'SELECT account_deletion_personal_row_counts($1)d',[lo.student])).d);for(const table of ['uc_scoped_journal_records','uc_scoped_journal_history','uc_scoped_journal_exports'])expect(counts).toContain(table);expect(await trustedErase(c.db,job)).toEqual({erased:true});
 expect(Number((await one(c.db,'SELECT count(*)n FROM uc_scoped_journal_exports WHERE id=$1',[artifact.export.id])).n)).toBe(0);await caller(c.db,lo.owner);const retained=await allRecords(c,made.journal.id,organization);expect(retained.rows).toHaveLength(1);expect(retained.rows[0].subject).toEqual({kind:'person',user_id:lo.otherStudent});expect(retained.rows[0].values.notes).toBe('Unrelated other subject retained');
 const author='fa000015-0000-4000-8000-000000000001',staff='fa000015-0000-4000-8000-000000000002';await c.db.exec('RESET ROLE');await c.db.query('INSERT INTO auth.users(id)VALUES($1)',[author]);await c.db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic journal author')",[author,lo.org]);await c.db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'custom','[\"journals.read\",\"journals.write\"]')",[staff,author,lo.org]);
 await caller(c.db,author);const authored=await c.save(made.journal,{notes:'AUTHOR_ONLY_SYNTHETIC_PRIVATE_MARKER'},none,none,null,organization);const authoredExport=await capture(c,made.journal,organization);await c.db.exec('RESET ROLE');const authorJob=await prepareTrustedErase(c.db,author);expect(await trustedErase(c.db,authorJob)).toEqual({erased:true});
 for(const table of sideTables){const rows=(await one(c.db,'SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\')rows FROM '+table+' t')).rows;expect(JSON.stringify(rows)).not.toContain(author);expect(JSON.stringify(rows)).not.toContain('AUTHOR_ONLY_SYNTHETIC_PRIVATE_MARKER');}
 expect(Number((await one(c.db,'SELECT count(*)n FROM uc_scoped_journal_exports WHERE id=$1',[authoredExport.export.id])).n)).toBe(0);const redacted=await one(c.db,'SELECT redacted,field_values FROM uc_scoped_journal_records WHERE id=$1',[authored.record.id]);expect(redacted.redacted).toBe(true);expect(redacted.field_values).toEqual({});expect((await one(c.db,"SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY organization_id,month_start),'[]')rows FROM organization_monthly_course_usage t")).rows).toEqual(usage);
 c.note({kind:'full_privacy_erasure',validatedWholeJob:true,firstRollbackDataExact:true,subjectExportsDeleted:true,authorOnlyNonpersonalCopiesRedacted:true,unrelatedSubjectPreserved:true,monthlyUsageNotRefunded:true});
});
register(8,async c=>{
 const fields=Array.from({length:8},()=>({id:randomUUID(),label:'Synthetic bounded text',semantic:'custom',type:'text'}));const made=await c.create(organization,fields);const values=Object.fromEntries(fields.map(f=>[f.id,'x'.repeat(3900)]));expect(Buffer.byteLength(JSON.stringify(values))).toBeLessThan(32768);
 for(let index=0;index<140;index++)await c.save(made.journal,values,none,none,null,organization);
 const before=await journalRows(c.db,made.journal.id);await caller(c.db,lo.owner);const failed=await denied(()=>capture(c,made.journal,organization),'CUSTOM_JOURNAL_LIMIT_EXCEEDED');expect(await journalRows(c.db,made.journal.id)).toEqual(before);
 await caller(c.db,lo.owner);const many=await c.create(organization);for(let index=0;index<1001;index++)await c.save(many.journal,{notes:'Synthetic bounded small row '+index},none,none,null,organization);
 await c.db.exec('RESET ROLE');expect(Number((await one(c.db,'SELECT count(*)n FROM uc_scoped_journal_records WHERE journal_id=$1',[many.journal.id])).n)).toBe(1001);await caller(c.db,lo.owner);
 const countFailure=await denied(()=>capture(c,many.journal,organization),'CUSTOM_JOURNAL_LIMIT_EXCEEDED');await c.db.exec('RESET ROLE');expect(Number((await one(c.db,'SELECT count(*)n FROM uc_scoped_journal_exports WHERE journal_id=$1',[many.journal.id])).n)).toBe(0);
 c.note({kind:'complete_export_size_refusal',actualRows:140,eachValuesBytes:Buffer.byteLength(JSON.stringify(values)),actualRPC:true,code:failed.code,recordStorageAllows1001:true,completeExportOver1000Refused:countFailure.code,noTruncation:true,noPartialExportOrRequest:true});
});

register(9,async c=>{
 // Both are real ordinary group rows. A current member can have a personal note
 // without inventing an enrollment, programme, session or teacher decision.
 const courseLessGroup=randomUUID();await caller(c.db,lo.owner);await c.db.exec('RESET ROLE');
 await c.db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,NULL,'Synthetic ordinary group without a course')",[courseLessGroup,lo.org]);
 await c.db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$3)',[lo.org,courseLessGroup,lo.student,lo.otherGroup]);
 await caller(c.db,lo.owner);const facts:any[]=[];
 for(const [groupId,courseId]of[[courseLessGroup,null],[lo.otherGroup,lo.course]]){
  const context={kind:'group',group_id:groupId}as const;
  const listed=await c.read(context,{kind:'list',after_id:null,limit:50,include_archived:false});
  expect(listed.context).toEqual({kind:'group',group_id:groupId,course_id:courseId,program_ref:null});expect(listed.capabilities.can_write).toBe(true);
  const made=await c.create(context,notes,'Synthetic ordinary group notes');expect(made.journal.context).toEqual(listed.context);expect(made.journal.source_current).toBe(true);
  const unbound=await c.save(made.journal,{notes:'Ordinary nonpersonal group note'},none,none,null,context);
  const personal=await c.save(made.journal,{notes:'Ordinary member note without programme inference'},{kind:'person',user_id:lo.student},none,null,context);
  expect(unbound.record.subject).toEqual(none);expect(personal.record.subject).toEqual({kind:'person',user_id:lo.student});expect(personal.record.source).toEqual(none);
  const subjects=await c.read(context,{kind:'subjects',journal_id:made.journal.id,after_id:null,limit:50});expect(subjects.subjects.map((p:any)=>p.user_id)).toEqual([lo.student]);
  for(const sourceKind of['session','outcome']){const sources=await c.read(context,{kind:'sources',journal_id:made.journal.id,source_kind:sourceKind,subject_user_id:lo.student,after_id:null,limit:25});expect(sources.sources).toEqual([]);}
  const inventedSession={kind:'session',session_id:randomUUID(),session_version_id:randomUUID(),content_hash:'a'.repeat(64)};
  const inventedOutcome={kind:'outcome',program_enrollment_snapshot_id:randomUUID(),state_id:randomUUID(),revision:1,machine_id:randomUUID(),machine_input_hash:'b'.repeat(64),decision_id:randomUUID()};
  for(const source of[inventedSession,inventedOutcome])await noPartial(c,()=>c.save(made.journal,{notes:'Refuse educational authority without confirmed programme'},{kind:'person',user_id:lo.student},source,null,context),'CUSTOM_JOURNAL_SOURCE_UNAVAILABLE');
  const exported=await capture(c,made.journal,context);const checked=await verified(c,exported,context);expect(checked.manifest.context).toEqual(listed.context);expect(checked.manifest.records).toHaveLength(2);
  const beforeHistory=await allHistory(c,made.journal.id,personal.record.id,context);const beforeRows=await journalRows(c.db,made.journal.id);await caller(c.db,lo.owner);
  if(courseId===null){await c.db.exec('RESET ROLE');await c.db.query('UPDATE student_groups SET course_id=$1 WHERE id=$2 AND organization_id=$3',[lo.course,groupId,lo.org]);await caller(c.db,lo.owner);}
  else await c.db.query('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)d',[lo.org,groupId,lo.course,c.s.learning.program.id,randomUUID()]);
  const old=await c.read(context,{kind:'journal',journal_id:made.journal.id});expect(old.journal.context).toEqual(listed.context);expect(old.journal.source_current).toBe(false);expect(old.capabilities.can_write).toBe(false);
  await noPartial(c,()=>c.save(made.journal,{notes:'Do not reinterpret retained note under a new programme'},{kind:'person',user_id:lo.student},none,personal.record,context),'CUSTOM_JOURNAL_SOURCE_UNAVAILABLE');
  for(const action of[
   {action:'save_schema',journal_id:made.journal.id,title:made.journal.title,description:made.journal.description,fields:notes,reason:'Refuse retained-context schema rewrite'},
   {action:'archive_journal',journal_id:made.journal.id,archived:true,reason:'Refuse retained-context archive rewrite'},
  ])await noPartial(c,()=>c.act(context,action,made.journal.revision),'CUSTOM_JOURNAL_SOURCE_UNAVAILABLE');
  await noPartial(c,()=>c.act(context,{action:'archive_record',journal_id:made.journal.id,record_id:personal.record.id,archived:true,reason:'Refuse retained-context row archive rewrite'},personal.record.revision),'CUSTOM_JOURNAL_SOURCE_UNAVAILABLE');
  expect(await allHistory(c,made.journal.id,personal.record.id,context)).toEqual(beforeHistory);expect(await journalRows(c.db,made.journal.id)).toEqual(beforeRows);await caller(c.db,lo.owner);
  const downloaded=await verified(c,exported,context);expect(downloaded.htmlText).toBe(checked.htmlText);expect(downloaded.manifestText).toBe(checked.manifestText);
  const fresh=await c.create(context,notes,'Synthetic explicit journal for changed group context');expect(fresh.journal.id).not.toBe(made.journal.id);expect(fresh.journal.context.course_id).toBe(lo.course);expect(fresh.journal.context.program_ref===null).toBe(courseId===null);expect(fresh.journal.source_current).toBe(true);expect((await allRecords(c,fresh.journal.id,context)).rows).toEqual([]);
  facts.push({priorCourseId:courseId,priorProgramRef:null,ordinaryNonpersonalAndPersonalRows:2,sessionAndOutcomeSourceQueriesEmpty:true,sessionAndOutcomeWritesRefusedWithoutPartialRows:true,transition:courseId===null?'course_added':'approved_programme_bound',retainedContextReadOnly:true,allFourWriteKindsRefused:true,oldHistoryAndExportBytesRetained:true,newJournalExplicitEmpty:true});
 }
 c.note({kind:'ordinary_group_notes_nullable_context',variants:facts,oldNineCasesUnchanged:true,noProgrammeEnrollmentInvented:true});
});
