// @vitest-environment node
// SOURCE AUTHORED; do not count these cases as coverage until an actual held run.
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {actor,apply,create,createCustomJournalLab,fields,id,query,read,result,save} from './helpers/customJournalLab';
import {journalMutationSchema,journalReadSchema} from '@/lib/customJournals/contract';
let db:PGlite;
const legacy={id:'custom_legacy',title:'Synthetic import',description:'Original local meaning',fields:['full_name','doc_number','signature'],createdAt:'1900-01-01T00:00:00Z'};
async function denied(fn:()=>Promise<unknown>,marker:string){
 await db.exec('SAVEPOINT expected_denial');let error:any;
 try{await fn();}catch(e){error=e;}
 await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial');
 expect(error,'Expected actual server refusal').toBeTruthy();expect(String(error?.message)).toContain(marker);
}
async function anonymousRpcDenied(fn:()=>Promise<unknown>,functionName:'read_custom_journals'|'apply_custom_journal_action'){
 await db.exec('SAVEPOINT expected_anonymous_rpc_denial');let error:any;
 try{await fn();}catch(e){error=e;}
 await db.exec('ROLLBACK TO SAVEPOINT expected_anonymous_rpc_denial; RELEASE SAVEPOINT expected_anonymous_rpc_denial');
 expect(error,'Expected actual anonymous EXECUTE refusal').toMatchObject({code:'42501'});
 expect(String(error?.message)).toBe('permission denied for function '+functionName);
}
async function owner<T>(fn:()=>Promise<T>):Promise<T>{await db.exec('RESET ROLE');const value=await fn();await actor(db,1);return value;}
const oldRows=()=>result(db,"SELECT jsonb_build_object('instances',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM journal_instances x),'entries',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM journal_entries x),'ledger',(SELECT jsonb_agg(to_jsonb(x)ORDER BY version)FROM supabase_migrations.schema_migrations x),'urgent',md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)))AS result");
beforeAll(async()=>{db=await createCustomJournalLab();},30000);
beforeEach(async()=>{await db.exec('RESET ROLE; BEGIN');await actor(db,1);});
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE');});
afterAll(async()=>{await db?.close();});

describe('UC015-A actual private SQL API and wire',()=>{
 it('returns the agreed exact typed schema and a subject row, not legacy weekly marks',async()=>{
  const made=await create(db);expect(journalMutationSchema.safeParse(made).success).toBe(true);
  expect(made.journal.current_schema.fields).toEqual(fields);expect(made.journal.current_schema.version).toBe(1);
  const wrote=await save(db,made.journal,{full_name:'Synthetic person',grade:'4.250000',doc_date:'2024-02-29'});
  expect(journalMutationSchema.safeParse(wrote).success).toBe(true);expect(wrote.record.values.grade).toBe('4.250000');
  const page=await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25});
  expect(journalReadSchema.safeParse(page).success).toBe(true);expect(page.records).toHaveLength(1);expect(page.records[0].id).toBe(wrote.record.id);
 });
 it('has one persisted journal/row shared by two independently authorized employees',async()=>{
  const made=await create(db);await save(db,made.journal);
  await actor(db,3);const a=await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25});
  await actor(db,17);const b=await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25});
  expect(a).toEqual(b);expect(a.records.length).toBe(1);
 });
 it.each([4,5,7,8,9,12,13,14,15,16])('denies organization-wide reads and mutations to unauthorized actor %s',async(who)=>{
  await actor(db,who);await denied(()=>query(db,{kind:'list',after_id:null,limit:10,include_archived:false}),'ACCESS_DENIED');
  await denied(()=>create(db),'ACCESS_DENIED');
 });
 it('denies anonymous execution of both organization-wide RPCs at the ACL boundary',async()=>{
  await actor(db,null);
  await anonymousRpcDenied(()=>query(db,{kind:'list',after_id:null,limit:10,include_archived:false}),'read_custom_journals');
  await anonymousRpcDenied(()=>create(db),'apply_custom_journal_action');
 });
 it('keeps viewer read-only even with an explicit additive journals.write grant',async()=>{
  const made=await create(db);await actor(db,10);
  const p=await query(db,{kind:'journal',journal_id:made.journal.id});expect(p.capabilities).toEqual({can_read:true,can_write:false});
  await denied(()=>create(db),'ACCESS_DENIED');
 });
 it('allows current platform admin and org staff admin, with independent rights re-evaluation',async()=>{
  await actor(db,2);expect((await create(db,910)).journal.id).toBeTruthy();
  await actor(db,3);const made=await create(db,911);expect(made.capabilities.can_write).toBe(true);
  await owner(()=>db.query('UPDATE org_staff SET expires_at=now()-interval \'1 second\'WHERE user_id=$1',[id(3)]));await actor(db,3);
  await denied(()=>apply(db,{action:'archive_journal',journal_id:made.journal.id,archived:true,reason:'Synthetic change'},1,912),'ACCESS_DENIED');
 });
 it('checks tenant on every requested journal and record identity',async()=>{
  const made=await create(db);await actor(db,7);
  await denied(()=>query(db,{kind:'journal',journal_id:made.journal.id},200),'NOT_FOUND');
  await denied(()=>apply(db,{action:'archive_journal',journal_id:made.journal.id,archived:true,reason:'Foreign write'},1,913,200),'NOT_FOUND');
 });
 it('requires a real current exact same-org subject; rejects unlinked/foreign/revoked subjects',async()=>{
  const made=await create(db);
  for(const subject of [20,9,14,15,16,999])await denied(()=>save(db,made.journal,{}, {subject,request:920+subject}),'ACCESS_DENIED');
  const a={action:'save_record',journal_id:made.journal.id,record_id:null,schema_version_id:made.journal.current_schema_id,subject_user_id:null,values:{},reason:''};
  await denied(()=>apply(db,a,0,930),'INVALID_INPUT');
  expect((await save(db,made.journal,{}, {subject:21,request:931})).record.subject_user_id).toBe(id(21));
 });
 it('does not let a correction transfer old personal history to another subject',async()=>{
  const made=await create(db);const first=await save(db,made.journal);
  await denied(()=>save(db,made.journal,{}, {recordId:first.record.id,revision:1,subject:21,request:932,reason:'Transfer'}),'INVALID_INPUT');
 });
 it('uses CAS for two employees and returns a truthful original receipt on retry',async()=>{
  const made=await create(db);const first=await save(db,made.journal);
  const action={action:'save_record',journal_id:made.journal.id,record_id:first.record.id,schema_version_id:made.journal.current_schema_id,subject_user_id:id(8),values:{grade:'5'},reason:'Synthetic correction'};
  await actor(db,3);const second=await apply(db,action,1,940);
  await actor(db,17);await denied(()=>apply(db,action,1,941),'REVISION_CONFLICT');
  await apply(db,{...action,values:{grade:'3'},reason:'Later correction'},2,942);
  await actor(db,3);const replay=await apply(db,action,1,940);
  expect(replay.receipt).toEqual({...second.receipt,replayed:true});expect(replay.record.revision).toBe(3);expect(replay.record.values.grade).toBe('3');
  await denied(()=>apply(db,{...action,values:{grade:'2'}},1,940),'REQUEST_CONFLICT');
  expect((await query(db,{kind:'history',journal_id:made.journal.id,record_id:first.record.id,after_revision:0,limit:25})).history.map((v:any)=>v.revision)).toEqual([1,2,3]);
 });
 it('rechecks current permission before replay instead of treating a receipt as authority',async()=>{
  await actor(db,3);await create(db,943);
  await owner(()=>db.query('INSERT INTO account_deletion_revocations VALUES($1)',[id(3)]));await actor(db,3);
  await denied(()=>create(db,943),'ACCESS_DENIED');
 });
 it('keeps original schema on old snapshots; only current schema can accept a new correction',async()=>{
  const made=await create(db);const first=await save(db,made.journal);
  const fs=[...fields,{id:'doc_number',label:'Номер',type:'text',semantic:'doc_number'}];
  const changed=await apply(db,{action:'save_schema',journal_id:made.journal.id,title:'Renamed',description:'Version 2',fields:fs,reason:'Add document number'},1,944);
  const old=(await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25})).records[0];expect(old.schema.version).toBe(1);expect(old.schema.fields).toEqual(fields);
  await denied(()=>save(db,made.journal,{}, {recordId:first.record.id,revision:1,request:945,reason:'Old schema'}),'SOURCE_UNAVAILABLE');
  const corrected=await save(db,changed.journal,{doc_number:'00004'}, {recordId:first.record.id,revision:1,request:946,reason:'Use current schema'});
  expect(corrected.record.values.doc_number).toBe('00004');
  const history=await query(db,{kind:'history',journal_id:made.journal.id,record_id:first.record.id,after_revision:0,limit:25});
  expect(history.history.map((h:any)=>h.schema.version)).toEqual([1,2]);expect(journalReadSchema.safeParse(history).success).toBe(true);
 });
 it('forbids reusing a field ID with another type, semantic or options after removal',async()=>{
  const custom={id:id(700),label:'Choice',type:'select',semantic:'custom',options:['A','B']};
  const made=await apply(db,{action:'create',title:'Choice journal',description:'',fields:[custom]},0,950);
  const removed=await apply(db,{action:'save_schema',journal_id:made.journal.id,title:'Choice journal',description:'',fields,reason:'Temporarily remove'},1,951);
  for(const field of [{...custom,type:'text',options:undefined},{...custom,options:['A','C']}]){
   const f=JSON.parse(JSON.stringify(field));await denied(()=>apply(db,{action:'save_schema',journal_id:made.journal.id,title:'Choice journal',description:'',fields:[f],reason:'Reuse'},2,952),'INVALID_INPUT');
  }
  expect((await apply(db,{action:'save_schema',journal_id:made.journal.id,title:'Choice journal',description:'',fields:[{...custom,label:'Renamed choice'}],reason:'Restore unchanged identity'},removed.journal.revision,953)).journal.current_schema.version).toBe(3);
 });
 it.each([
  {grade:'04'},{grade:4},{doc_date:'2025-02-29'},{doc_date:'2026-13-01'},{doc_date:'2026-1-01'},
  {full_name:3},{full_name:'x'.repeat(4001)},{unknown:'x'},{full_name:{hidden:'PII'}},
 ])('rejects invalid typed values without a partial row: %j',async(values)=>{
  const made=await create(db);await denied(()=>save(db,made.journal,values),'INVALID_INPUT');
  expect((await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25})).records).toEqual([]);
 });
 it('validates custom boolean, integer, time and select without string coercion',async()=>{
  const fs=[['boolean',710],['integer',711],['time',712],['select',713]].map(([type,n])=>({id:id(Number(n)),label:String(type),semantic:'custom',type,...(type==='select'?{options:['A','B']}: {})}));
  const made=await apply(db,{action:'create',title:'Typed',description:'',fields:fs},0,960);
  const good={[id(710)]:true,[id(711)]:9007199254740991,[id(712)]:'23:59:59',[id(713)]:'A'};
  expect((await save(db,made.journal,good)).record.values).toEqual(good);
  for(const bad of [{...good,[id(710)]:'true'},{...good,[id(711)]:9007199254740992},{...good,[id(712)]:'24:00'},{...good,[id(713)]:'C'}])await denied(()=>save(db,made.journal,bad,{request:961}),'INVALID_INPUT');
 });
 it('rejects unknown keys, duplicate fields, signature claims and oversized requests',async()=>{
  for(const fs of [[fields[0],fields[0]],[{id:'signature',label:'Signed',type:'boolean',semantic:'signature'}],[{...fields[0],extra:true}]])await denied(()=>apply(db,{action:'create',title:'Invalid',description:'',fields:fs}),'INVALID_INPUT');
  await denied(()=>apply(db,{action:'create',title:'Invalid',description:'',fields,legal_signature:true}),'INVALID_INPUT');
  const big=Array.from({length:9},(_,n)=>({id:id(720+n),label:'Text',type:'long_text',semantic:'custom'}));
  const made=await apply(db,{action:'create',title:'Bounded',description:'',fields:big},0,962);
  expect((await save(db,made.journal,Object.fromEntries(big.slice(0,8).map(f=>[f.id,'x'.repeat(4000)])),{request:964})).record.revision).toBe(1);
  await denied(()=>save(db,made.journal,Object.fromEntries(big.map(f=>[f.id,'x'.repeat(4000)])),{request:963}),'INVALID_INPUT');
  await denied(()=>save(db,made.journal,Object.fromEntries(big.map(f=>[f.id,'Я'.repeat(3000)])),{request:965}),'INVALID_INPUT');
 });
 it('archives instead of deleting and preserves history, with stable cursor pages',async()=>{
  const made=await create(db);const first=await save(db,made.journal);await save(db,made.journal,{}, {request:970});
  const archived=await apply(db,{action:'archive_record',journal_id:made.journal.id,record_id:first.record.id,archived:true,reason:'Synthetic archive'},1,971);
  expect(archived.record.archived).toBe(true);
  const page1=await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:1});
  const page2=await query(db,{kind:'records',journal_id:made.journal.id,after_id:page1.next_after_id,limit:1});
  expect(page1.next_after_id).toBeTruthy();expect(page2.next_after_id).toBeNull();expect(new Set([...page1.records,...page2.records].map(r=>r.id)).size).toBe(2);
  const h1=await query(db,{kind:'history',journal_id:made.journal.id,record_id:first.record.id,after_revision:0,limit:1});
  const h2=await query(db,{kind:'history',journal_id:made.journal.id,record_id:first.record.id,after_revision:h1.next_after_revision,limit:1});
  expect(h1.history[0].revision).toBe(1);expect(h2.history[0].action).toBe('archive_record');expect(h2.next_after_revision).toBeNull();
  const journal=await apply(db,{action:'archive_journal',journal_id:made.journal.id,archived:true,reason:'Archive journal'},1,972);
  expect(journal.journal.archived).toBe(true);expect(journal.journal.revision).toBe(2);
  expect((await query(db,{kind:'list',after_id:null,limit:50,include_archived:false})).journals).toEqual([]);
  await denied(()=>save(db,journal.journal,{}, {request:973}),'SOURCE_UNAVAILABLE');
 });
 it('returns only real current same-org subjects and enforces all page bounds',async()=>{
  const page=await query(db,{kind:'subjects',after_id:null,limit:50});expect(journalReadSchema.safeParse(page).success).toBe(true);
  const ids=page.subjects.map((s:any)=>s.user_id);expect(ids).toContain(id(21));for(const n of [20,9,14,15,16])expect(ids).not.toContain(id(n));
  await denied(()=>query(db,{kind:'subjects',after_id:null,limit:51}),'INVALID_INPUT');
  await denied(()=>query(db,{kind:'list',after_id:null,limit:1,include_archived:false,organization_id:id(200)}),'INVALID_INPUT');
 });
 it('imports just the exact local definition once and preserves every legacy row/ledger/RPC',async()=>{
  const before=await owner(oldRows);const preview=await query(db,{kind:'preview_legacy',definition:legacy});
  expect(preview.preview).toMatchObject({state:'ready',server_legacy_instance_count:1,server_legacy_entry_count:1});
  const imported=await apply(db,{action:'import_definition',definition:legacy},0,980);expect(imported.journal.current_schema.fields.map((f:any)=>f.id)).toEqual(legacy.fields);
  const signature=imported.journal.current_schema.fields.find((f:any)=>f.id==='signature');expect(signature.type).toBe('text');
  const same=await apply(db,{action:'import_definition',definition:{...legacy,createdAt:'2099-01-01'}},0,981);expect(same.receipt.outcome).toBe('import_existing');expect(same.journal.id).toBe(imported.journal.id);
  await denied(()=>apply(db,{action:'import_definition',definition:{...legacy,title:'Conflicting title'}},0,982),'IMPORT_CONFLICT');
  const old=await query(db,{kind:'legacy_records',legacy_id:legacy.id,after_id:null,limit:25});expect(old.records[0].value).toBe('04');expect(journalReadSchema.safeParse(old).success).toBe(true);
  expect((await query(db,{kind:'records',journal_id:imported.journal.id,after_id:null,limit:25})).records).toEqual([]);
  expect(await owner(oldRows)).toEqual(before);
 });
 it('discovers orphaned server legacy journals without inventing fields or needing localStorage',async()=>{
  const inventory=await query(db,{kind:'legacy_inventory',after_legacy_id:null,limit:50});
  expect(inventory.legacy_journals).toEqual([{legacy_id:'custom_legacy',instance_count:1,entry_count:1}]);expect(journalReadSchema.safeParse(inventory).success).toBe(true);
  expect((await query(db,{kind:'legacy_records',legacy_id:inventory.legacy_journals[0].legacy_id,after_id:null,limit:25})).records[0].notes).toBe('Synthetic legacy note');
  await denied(()=>query(db,{kind:'legacy_inventory',after_legacy_id:null,limit:51}),'INVALID_INPUT');
 });
 it('rejects invalid local definitions without partial registry writes',async()=>{
  for(const fields of [['unknown'],['full_name','full_name'],[null],[1],[{}]]){
   await denied(()=>query(db,{kind:'preview_legacy',definition:{...legacy,fields}}),'INVALID_INPUT');
   await denied(()=>apply(db,{action:'import_definition',definition:{...legacy,fields}},0,983),'INVALID_INPUT');
  }
  expect((await query(db,{kind:'list',after_id:null,limit:50,include_archived:true})).journals).toEqual([]);
 });
 it('roundtrips exact UTF16 label/options/value boundaries through the strict frozen client contract',async()=>{
  const custom={id:id(740),label:'🙂'.repeat(60),type:'select',semantic:'custom',options:['🙂'.repeat(40)]};
  const made=await apply(db,{action:'create',title:'🙂'.repeat(100),description:'🙂'.repeat(1000),fields:[...fields,custom]},0,984);
  expect(journalMutationSchema.safeParse(made).success).toBe(true);
  const wrote=await save(db,made.journal,{full_name:'🙂'.repeat(2000),[custom.id]:custom.options[0]},{request:985});
  expect(journalMutationSchema.safeParse(wrote).success).toBe(true);
  await denied(()=>save(db,made.journal,{full_name:'🙂'.repeat(2001)},{request:986}),'INVALID_INPUT');
  await denied(()=>apply(db,{action:'create',title:'Invalid label',description:'',fields:[{...custom,label:'🙂'.repeat(61)}]},0,987),'INVALID_INPUT');
  await denied(()=>apply(db,{action:'create',title:'Invalid option',description:'',fields:[{...custom,options:['🙂'.repeat(41)]}]},0,988),'INVALID_INPUT');
  await denied(()=>apply(db,{action:'create',title:'🙂'.repeat(101),description:'',fields},0,989),'INVALID_INPUT');
  await owner(()=>db.query('UPDATE profiles SET full_name=$1 WHERE user_id=$2',['🙂'.repeat(240),id(8)]));
  const subjects=await query(db,{kind:'subjects',after_id:null,limit:50});expect(journalReadSchema.safeParse(subjects).success).toBe(true);expect(subjects.subjects.find((s:any)=>s.user_id===id(8)).label.length).toBe(240);
 });
 it('blocks direct authenticated/service/default-role DML and all private helper execution',async()=>{
  const made=await create(db);
  for(const role of ['authenticated','service_role','uc015_default_bystander']){
   await db.exec('RESET ROLE');await db.exec('SET ROLE '+role);
   await denied(()=>db.query('SELECT * FROM uc_custom_journals'),'permission denied');
   await denied(()=>db.query('UPDATE uc_custom_journals SET title=\'Forged\'WHERE id=$1',[made.journal.id]),'permission denied');
   await denied(()=>db.query('SELECT public.uc_custom_journal_detail($1,true)',[made.journal.id]),'permission denied');
   await denied(()=>db.query('SELECT public.uc_custom_journal_erase_user($1)',[id(8)]),'permission denied');
  }
 });
 it('has owner-only tables/22 exact functions and cannot change immutable history even as owner',async()=>{
  const made=await create(db);const wrote=await save(db,made.journal);
  await db.exec('RESET ROLE');await denied(()=>db.query('UPDATE uc_custom_journal_history SET reason=\'forged\'WHERE record_id=$1',[wrote.record.id]),'ACCESS_DENIED');
  const count=(await db.query<{n:number}>("SELECT count(*)::integer n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_custom_journal_%'OR p.proname IN('read_custom_journals','apply_custom_journal_action'))")).rows[0].n;expect(count).toBe(22);
  const grants=await db.query("SELECT c.relname,a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.relname LIKE 'uc_custom_journal%'AND a.grantee<>c.relowner");expect(grants.rows).toEqual([]);
 });
 it('erases all explicit subject values/history/receipts, and rejects a forged erase context',async()=>{
  const made=await create(db);await save(db,made.journal,{full_name:'Synthetic erase subject'});
  await db.exec('RESET ROLE');await denied(()=>db.query('SELECT public.uc_custom_journal_erase_user($1)',[id(8)]),'ACCESS_DENIED');
  await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[id(8)]);
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',true),set_config('sintagma.account_deletion_erase_user',$1,true)",[id(8)]);
  await db.query('SELECT public.uc_custom_journal_erase_user($1)',[id(8)]);
  expect(await result(db,'SELECT public.uc_custom_journal_personal_counts($1)AS result',[id(8)])).toEqual([]);
  expect((await db.query('SELECT * FROM uc_custom_journal_records')).rows).toEqual([]);expect((await db.query('SELECT * FROM uc_custom_journal_history')).rows).toEqual([]);
  expect((await db.query('SELECT * FROM uc_custom_journal_requests WHERE subject_user_id=$1',[id(8)])).rows).toEqual([]);
 });
 it('redacts every exact author copy, retains numeric history, and fully rolls erasure back',async()=>{
  await actor(db,3);const made=await create(db);const wrote=await save(db,made.journal,{full_name:'Synthetic actor text'});
  await db.exec('RESET ROLE; SAVEPOINT before_erasure');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[id(3)]);
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',true),set_config('sintagma.account_deletion_erase_user',$1,true)",[id(3)]);
  await db.query('SELECT public.uc_custom_journal_erase_user($1)',[id(3)]);
  expect(await result(db,'SELECT public.uc_custom_journal_personal_counts($1)AS result',[id(3)])).toEqual([]);
  const r=(await db.query<any>('SELECT * FROM uc_custom_journal_records WHERE id=$1',[wrote.record.id])).rows[0];expect(r).toMatchObject({revision:1,recorded_by:null,field_values:{},redacted:true,subject_user_id:id(8)});
  await actor(db,1);const readback=await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25});expect(journalReadSchema.safeParse(readback).success).toBe(true);expect(readback.records[0].schema.fields).toEqual([]);
  await denied(()=>save(db,made.journal,{}, {request:990}),'SOURCE_UNAVAILABLE');
  await db.exec('ROLLBACK TO SAVEPOINT before_erasure; RELEASE SAVEPOINT before_erasure');await actor(db,1);
  expect((await query(db,{kind:'records',journal_id:made.journal.id,after_id:null,limit:25})).records[0].values.full_name).toBe('Synthetic actor text');
 });
 it('pins only exact post014/116 erasure predecessors and changes no old owner/ACL',async()=>{
  await db.exec('RESET ROLE');
  const pins=JSON.parse(await read('supabase/tests/fixtures/uc-custom-journals-erasure-pins.json'));
  for(const fn of pins.functions){const v=(await db.query<{md5:string}>('SELECT md5(pg_get_functiondef($1::regprocedure))',[fn.signature])).rows[0];expect(v.md5).toBe(fn.post_definition_md5);}
  expect((await db.query("SELECT o.signature FROM uc015_fixture_oldmeta o LEFT JOIN pg_proc p ON p.oid=o.oid WHERE p.oid IS NULL OR to_jsonb(p)-ARRAY['prosrc','probin']IS DISTINCT FROM o.metadata OR(o.signature NOT IN('account_deletion_personal_row_counts(uuid)','account_deletion_snapshot(uuid)','account_deletion_erase_data(uuid,text)')AND pg_get_functiondef(p.oid)IS DISTINCT FROM o.definition)")).rows).toEqual([]);
  expect((await db.query<{md5:string}>("SELECT md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure))")).rows[0].md5).toBe('f38189a9960f714e43a3ebcbc60f336e');
 });
});
