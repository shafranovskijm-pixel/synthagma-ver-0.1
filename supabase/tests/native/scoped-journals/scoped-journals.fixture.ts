// Source only: actual accepted PostgreSQL fixture and product RPCs, no permission stubs.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createFullCycleFixture,seedFullCycle,caller,one,lo,prepareTrustedErase,trustedErase,type FullCycleDb} from '../full-cycle/full-cycle.fixture';
import {scopedReadSchema,scopedMutationSchema,type ScopedContextInput} from '@/lib/customJournals/scopedContract';
export {caller,one,lo,prepareTrustedErase,trustedErase};
export type {FullCycleDb};
export const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export const notes=[{id:'notes',label:'Synthetic original notes <&"label>',type:'long_text',semantic:'notes'}];
export const none={kind:'none'} as const;
export const group={kind:'group',group_id:lo.group} as const;
export const organization={kind:'organization'} as const;
export const sideTables=['uc_scoped_journal_contexts','uc_scoped_journal_records','uc_scoped_journal_history','uc_scoped_journal_requests','uc_scoped_journal_exports'];
export const changedFour=['apply_custom_journal_action(uuid,bigint,uuid,jsonb)','read_custom_journals(uuid,jsonb)','uc_custom_journal_personal_counts(uuid)','uc_custom_journal_erase_user(uuid)'];
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export async function oldAction(db:any,action:any,revision=0,request=randomUUID()){return(await one(db,'SELECT apply_custom_journal_action($1,$2,$3,$4)d',[lo.org,revision,request,JSON.stringify(action)])).d;}
export async function oldRead(db:any,query:any){return(await one(db,'SELECT read_custom_journals($1,$2)d',[lo.org,JSON.stringify(query)])).d;}
export async function scopeRead(db:any,context:ScopedContextInput,query:any,org=lo.org){const value=(await one(db,'SELECT read_scoped_custom_journals($1,$2,$3)d',[org,JSON.stringify(context),JSON.stringify(query)])).d;expectWire(scopedReadSchema,value);return value;}
export async function scopeAction(db:any,context:ScopedContextInput,action:any,revision=0,request=randomUUID(),org=lo.org){const value=(await one(db,'SELECT apply_scoped_custom_journal_action($1,$2,$3,$4,$5)d',[org,JSON.stringify(context),revision,request,JSON.stringify(action)])).d;expectWire(scopedMutationSchema,value);return value;}
function expectWire(schema:any,value:any){const parsed=schema.safeParse(value);if(!parsed.success)throw Error('Actual SQL response violates held client V2 wire: '+JSON.stringify(parsed.error.issues).slice(0,3500));}
export async function dataDigests(db:any){
 await db.exec("RESET ROLE;SET TIME ZONE 'UTC'");const rows=(await db.query<any>("SELECT n.nspname schema,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage')AND c.relkind IN('r','p')ORDER BY n.nspname COLLATE\"C\",c.relname COLLATE\"C\"")).rows;const result:any={};
 for(const r of rows){result[r.schema+'.'+r.name]=await one(db,`SELECT count(*)::text count,encode(digest(coalesce(string_agg(h,'' ORDER BY h COLLATE"C"),''),'sha256'),'hex')sha256 FROM(SELECT encode(digest(to_jsonb(t)::text,'sha256'),'hex')h FROM ${quote(r.schema)}.${quote(r.name)} t)hashes`);}
 return result;
}
export async function journalRows(db:any,journalId:string){await db.exec('RESET ROLE');const result:any={};for(const table of ['uc_custom_journals','uc_custom_journal_schemas','uc_custom_journal_records','uc_custom_journal_history','uc_custom_journal_requests',...sideTables])result[table]=(await one(db,`SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]')rows FROM public.${quote(table)} t WHERE ${table==='uc_custom_journals'?'id':'journal_id'}=$1`,[journalId])).rows;return result;}
export async function outcomeRows(db:any){await db.exec('RESET ROLE');const result:any={};for(const table of ['uc_learning_outcome_states','uc_learning_machine_results','uc_learning_attestation_decisions','uc_conducted_sessions','uc_conducted_session_versions','uc_session_document_drafts'])result[table]=(await one(db,`SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY to_jsonb(t)::text),'[]')rows FROM public.${quote(table)} t`)).rows;return result;}
export async function metadata(db:any){
 await db.exec('RESET ROLE');return(await one(db,`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')','metadata',to_jsonb(p)-'prosrc','source_md5',md5(p.prosrc))ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d)ORDER BY d.oid),'[]')FROM pg_default_acl d),'roles',(SELECT jsonb_agg(to_jsonb(r)ORDER BY r.oid)FROM pg_roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY m.roleid,m.member,m.grantor),'[]')FROM pg_auth_members m),'settings',(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY s.setdatabase,s.setrole),'[]')FROM pg_db_role_setting s))metadata`)).metadata;
}
export async function createScopedFixture(hostileDefaults=false,saveMetadata=false){
 const db=await createFullCycleFixture();
 try{
  const prerequisite=readFileSync('supabase/migrations/20261021180000_uc_generic_calendar_artifacts.sql');if(sha(prerequisite)!=='c97e13ce49e95cb1410815b91eb30465eef9db03615f9e4be78e4c65b99a5dc0')throw Error('Exact accepted614 source required');await db.exec(prerequisite.toString('utf8'));
  const s=await seedFullCycle(db);await db.exec('RESET ROLE');
  // Explicit synthetic test permissions, not an authority helper replacement.
  await db.query("UPDATE org_staff SET sections_access=sections_access||'[\"journals.read\",\"journals.write\"]'::jsonb WHERE user_id=ANY($1::uuid[])",[[lo.teacher,lo.reviewer]]);
  await db.query("UPDATE org_staff SET sections_access=sections_access||'[\"journals.read\"]'::jsonb WHERE user_id=$1",[lo.reader]);
  await caller(db,lo.owner);const old=await oldAction(db,{action:'create',title:'Synthetic old v1 journal',description:'Retained legacy API witness',fields:notes});
  await oldAction(db,{action:'save_record',journal_id:old.journal.id,record_id:null,schema_version_id:old.journal.current_schema_id,subject_user_id:lo.otherStudent,values:{notes:'Retained old subject note'},reason:'Synthetic original old typed row'});
  if(hostileDefaults){await db.exec('RESET ROLE');await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO authenticated,anon,service_role WITH GRANT OPTION;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated,anon,service_role WITH GRANT OPTION');}
  const beforeData=await dataDigests(db),beforeMetadata=await metadata(db),oldWitness=await journalRows(db,old.journal.id);
  const contract=JSON.parse(readFileSync(join(process.env.UC116_NATIVE_PROFILE!,'profile-contract.json'),'utf8'));
  const raw=readFileSync('supabase/migrations/20261021200000_uc_scoped_journal_context_exports.sql');if(sha(raw)!==contract.appendMigration.rawSHA256)throw Error('Exact frozen615 source required');await db.exec(raw.toString('utf8'));
  const afterData=await dataDigests(db),afterMetadata=await metadata(db);
  for(const[name,digest]of Object.entries(beforeData))if(JSON.stringify(afterData[name])!==JSON.stringify(digest))throw Error('Old table changed by additive615: '+name);
  for(const[key,value]of Object.entries(beforeMetadata)){if(key!=='functions'&&JSON.stringify(afterMetadata[key])!==JSON.stringify(value))throw Error('Old role/default metadata changed: '+key);}
  const oldFunctions=beforeMetadata.functions;
  for(const f of oldFunctions){const current=afterMetadata.functions.find((x:any)=>x.signature===f.signature);if(!current||JSON.stringify(current.metadata)!==JSON.stringify(f.metadata)||(!changedFour.includes(f.signature)&&current.source_md5!==f.source_md5))throw Error('Unreviewed old function metadata/source change: '+f.signature);}
  for(const signature of changedFour){if(afterMetadata.functions.find((f:any)=>f.signature===signature)?.source_md5===oldFunctions.find((f:any)=>f.signature===signature)?.source_md5)throw Error('Required old bridge body did not change: '+signature);}
  const newFunctions=afterMetadata.functions.filter((f:any)=>!oldFunctions.some((o:any)=>o.signature===f.signature));if(newFunctions.length!==contract.expectedNewFunctions)throw Error('Exact frozen new scoped functions count required');
  const parentFKTriggerShapes=(await db.query<any>(`SELECT parent_ns.nspname parent_schema,parent_rel.relname parent_table,child_ns.nspname child_schema,child_rel.relname child_table,c.conname constraint_name,pg_get_constraintdef(c.oid,true)constraint_definition,fn_ns.nspname||'.'||quote_ident(fn.proname)||'('||pg_get_function_identity_arguments(fn.oid)||')'function_identity,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,t.tgnargs,encode(t.tgargs,'hex')tgargs_hex,t.tgattr::text tgattr FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint JOIN pg_class parent_rel ON parent_rel.oid=t.tgrelid JOIN pg_namespace parent_ns ON parent_ns.oid=parent_rel.relnamespace JOIN pg_class child_rel ON child_rel.oid=c.conrelid JOIN pg_namespace child_ns ON child_ns.oid=child_rel.relnamespace JOIN pg_proc fn ON fn.oid=t.tgfoid JOIN pg_namespace fn_ns ON fn_ns.oid=fn.pronamespace WHERE t.tgisinternal AND c.contype='f'AND parent_ns.nspname='public'AND parent_rel.relname IN('uc_custom_journals','uc_custom_journal_schemas')AND child_ns.nspname='public'AND child_rel.relname=ANY($1::text[])ORDER BY parent_rel.relname COLLATE"C",c.conname COLLATE"C",t.tgtype`,[sideTables])).rows;
  if(parentFKTriggerShapes.length!==6)throw Error('Exactly six portable parent FK trigger shapes required');
  const nativeCatalog={kind:'UC015_SCOPED615_ACTUAL_NATIVE_FUNCTIONS',oldFour:afterMetadata.functions.filter((f:any)=>changedFour.includes(f.signature)),newFunctions,parentFKTriggerShapes};
  if(saveMetadata)writeFileSync(join(process.env.UC116_NATIVE_OUTPUT!,'uc015-post-append-native-metadata.json'),JSON.stringify(nativeCatalog,null,2)+'\n');
  await caller(db,lo.owner);
  return {db,s,old,oldWitness,beforeData,beforeMetadata,afterMetadata,nativeCatalog,
   async create(context:ScopedContextInput=group,fields:any[]=notes,title='Synthetic scoped journal'){return scopeAction(db,context,{action:'create',title,description:'Synthetic native journal, no official issuance',fields});},
   async save(journal:any,values:any,subject:any={kind:'person',user_id:lo.student},source:any=none,record:any=null,context:ScopedContextInput=group,request?:string){return scopeAction(db,context,{action:'save_record',journal_id:journal.id,record_id:record?.id??null,schema_version_id:journal.current_schema_id,subject,source,values,reason:record?'Synthetic explicit correction':'Synthetic initial row'},record?.revision??0,request);},
   read:(context:ScopedContextInput,query:any,connection:any=db)=>scopeRead(connection,context,query),
   act:(context:ScopedContextInput,action:any,revision=0,request?:string,connection:any=db)=>scopeAction(connection,context,action,revision,request),
  };
 }catch(error){await db.close();throw error;}
}
