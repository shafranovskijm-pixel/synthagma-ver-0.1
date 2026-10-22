// Source-only actual PG17 fixture: accepted615+617+618 and exactUC023, no permission stubs.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fixture as createRegistryFixture,act as copyAct,caller,one,lo,dataDigests,metadata,prepareTrustedErase,trustedErase} from '../copy-registry/copy-registry.fixture';
export {caller,one,lo,dataDigests,metadata,prepareTrustedErase,trustedErase,copyAct};
export const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export const sourceFiles={metadata:'supabase/tests/fixtures/uc023-dsr-actual-metadata.json',dependencies:'supabase/tests/fixtures/uc023-kpi-actual-dependencies.json',updatedAt:'supabase/tests/fixtures/uc023-updated-at-actual-metadata.json'};
const expectedMetadataSHA='5e61dbf8bd91bd29189ab510269ce1887150f67df8105764a5c043a09135bdbe';
const expectedDependencySHA='507e1ef28a9699ec7911f3503442ebbddeb694fe3cf73f05d6fd371cc6fb55f7';
export const list=async(db:any,org:string|null=lo.org,id:string|null=null,cursor:any=null,limit=100)=>(await one<any>(db,'SELECT uc_dsr_list($1,$2,$3,$4)d',[org,id,cursor===null?null:JSON.stringify(cursor),limit])).d;
export const create=async(db:any,type='access',id=randomUUID(),org=lo.org,description='Synthetic request',email='synthetic@example.test')=>(await one<any>(db,'SELECT uc_dsr_create($1,$2,$3,$4,$5)d',[id,org,type,description,email])).d;
export const apply=async(db:any,r:any,action:string,payload:any,revision=r.deadline_revision)=>(await one<any>(db,'SELECT uc_dsr_apply($1,$2,$3,$4)d',[r.id,revision,action,JSON.stringify(payload)])).d;
export const review=(basis='access',trigger='2026-10-22',extra:any={})=>({basis,trigger_on:trigger,time_zone:'Asia/Vladivostok',calendar_id:'rf-five-day-2026',facts_confirmed:true,reason:'Synthetic checked actual trigger evidence',status:'in_progress',decision:'processing',...extra});
export async function fixture(){
 const base=await createRegistryFixture(false),db=base.db;
 try{
  await db.exec('RESET ROLE');
  const contract=JSON.parse(readFileSync(join(process.env.UC116_NATIVE_PROFILE!,'profile-contract.json'),'utf8'));
  const mraw=readFileSync(sourceFiles.metadata),draw=readFileSync(sourceFiles.dependencies);
  if(sha(mraw)!==expectedMetadataSHA||sha(draw)!==expectedDependencySHA)throw Error('Actual production metadata pin changed');
  const m=JSON.parse(mraw.toString('utf8')).result.rows[0].inspection,d=JSON.parse(draw.toString('utf8')).result.rows[0].inspection;
  // Restore only actual query columns missing from the accepted miniature base.
  // Existing types, rows, policies, triggers and constraints are never replaced.
  const needed:Record<string,string[]>={document_signatures:['organization_id','deleted_at','status','expires_at','created_at','signed_at'],education_document_records:['organization_id','deleted_at','created_at','document_status'],companies:['id','organization_id'],company_documents:['company_id','deleted_at','type','is_paid'],commercial_proposals:['organization_id','deleted_at','status'],incoming_documents:['organization_id','deleted_at','created_at']};
  for(const t of d.tables){
   const exists=await one<any>(db,'SELECT to_regclass($1)::text t',['public.'+t.name]);
   const columns=t.columns.filter((c:any)=>needed[t.name].includes(c.name));
   if(!exists.t)await db.exec('CREATE TABLE public.'+q(t.name)+'('+columns.map((c:any)=>q(c.name)+' '+c.type).join(',')+')');
   else for(const c of columns){const old=await one<any>(db,'SELECT format_type(atttypid,atttypmod)t FROM pg_attribute WHERE attrelid=$1::regclass AND attname=$2 AND NOT attisdropped',['public.'+t.name,c.name]);if(old&&old.t!==c.type)throw Error('Actual KPI dependency type differs '+t.name+'.'+c.name);if(!old)await db.exec('ALTER TABLE public.'+q(t.name)+' ADD COLUMN '+q(c.name)+' '+c.type);}
  }
  const dsrExists=(await one<any>(db,"SELECT to_regclass('public.data_subject_requests')::text t")).t;
  const type=(c:any)=>c.data_type==='ARRAY'?q(c.udt_schema)+'.'+q(c.udt_name.slice(1))+'[]':c.data_type==='USER-DEFINED'?q(c.udt_schema)+'.'+q(c.udt_name):c.data_type+(c.character_maximum_length?'('+c.character_maximum_length+')':'');
  const column=(c:any)=>q(c.column_name)+' '+type(c)+(c.column_default?' DEFAULT '+c.column_default:'')+(c.is_nullable==='NO'?' NOT NULL':'');
  if(!dsrExists)await db.exec('CREATE TABLE public.data_subject_requests('+m.columns.map(column).join(',')+')');
  else{
   // The accepted erasure miniature already creates attribution-only tables.
   // Complete only this EMPTY fixture relation; never replace a table/row/guard.
   if((await one<any>(db,'SELECT count(*)::int n FROM public.data_subject_requests')).n!==0)throw Error('Native DSR prerequisite unexpectedly nonempty');
   for(const c of m.columns){const current=await one<any>(db,"SELECT data_type,udt_name FROM information_schema.columns WHERE table_schema='public'AND table_name='data_subject_requests'AND column_name=$1",[c.column_name]);if(!current)await db.exec('ALTER TABLE public.data_subject_requests ADD COLUMN '+column(c));else{if(current.data_type!==c.data_type||current.udt_name!==c.udt_name)throw Error('Existing DSR fixture type differs '+c.column_name);if(c.column_default)await db.exec('ALTER TABLE public.data_subject_requests ALTER COLUMN '+q(c.column_name)+' SET DEFAULT '+c.column_default);if(c.is_nullable==='NO')await db.exec('ALTER TABLE public.data_subject_requests ALTER COLUMN '+q(c.column_name)+' SET NOT NULL');}}
  }
  for(const c of m.constraints){if((await one<any>(db,'SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2)present',['public.data_subject_requests',c.name])).present)throw Error('Unexpected preexisting native DSR constraint '+c.name);await db.exec('ALTER TABLE public.data_subject_requests ADD CONSTRAINT '+q(c.name)+' '+c.definition);}
  await db.exec('ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;GRANT ALL ON public.data_subject_requests TO anon,authenticated,service_role');
  for(const policy of m.policies)await db.exec('CREATE POLICY '+q(policy.policyname)+' ON public.data_subject_requests AS '+policy.permissive+' FOR '+policy.cmd+' TO '+policy.roles.map(q).join(',')+(policy.qual?' USING ('+policy.qual+')':'')+(policy.with_check?' WITH CHECK ('+policy.with_check+')':''));
  // Actual bodies only. New fixture definitions are installed only when absent;
  // any existing differing body fails closed instead of replacing an authority guard.
  for(const f of d.functions){
   let current=await one<any>(db,'SELECT md5(prosrc)m FROM pg_proc WHERE oid=to_regprocedure($1)',['public.'+f.signature]);
   if(!current){await db.exec(f.definition);await db.exec('REVOKE ALL ON FUNCTION public.'+f.signature+' FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.'+f.signature+' TO service_role');
    for(const acl of f.metadata.proacl??[]){const match=/^([^=]+)=([^/]+)\//.exec(acl);if(!match||match[1]==='postgres'||!match[2].includes('X'))continue;if((await one<any>(db,'SELECT EXISTS(SELECT1 FROM pg_roles WHERE rolname=$1)ok'.replace('SELECT1','SELECT 1'),[match[1]])).ok)await db.exec('GRANT EXECUTE ON FUNCTION public.'+f.signature+' TO '+q(match[1]));}
    current=await one<any>(db,'SELECT md5(prosrc)m FROM pg_proc WHERE oid=to_regprocedure($1)',['public.'+f.signature]);}
   if(current?.m!==f.md5)throw Error('Actual function body differs '+f.signature);
  }
  const uraw=readFileSync(sourceFiles.updatedAt);if(sha(uraw)!=='113660631c67162ce56bc8a8caed9cf4fabaea005e9c796c69bad868d6153286')throw Error('Actual updated_at metadata pin differs');const uf=JSON.parse(uraw.toString('utf8')).result.rows[0];
  if(!(await one<any>(db,"SELECT to_regprocedure('public.update_updated_at_column()')::text f")).f)await db.exec(uf.definition);
  if((await one<any>(db,"SELECT md5(prosrc)m FROM pg_proc WHERE oid='public.update_updated_at_column()'::regprocedure")).m!==uf.source_md5)throw Error('Actual updated_at body differs');
  for(const t of m.triggers.filter((t:any)=>!t.metadata.tgisinternal))await db.exec(t.definition);
  // Two historical nonempty rows exist BEFORE UC023. The oldINSERT trigger
  // receives explicit historical due dates; the migration must preserve both.
  const historical=randomUUID(),closedHistorical=randomUUID();
  await db.query("INSERT INTO data_subject_requests(id,user_id,organization_id,request_type,status,description,due_date,created_at,response)VALUES($1,$2,$3,'access','pending','Synthetic historical old rule','2026-09-01','2026-08-01T00:00:00Z',NULL),($4,$5,$3,'withdrawal','resolved','Synthetic closed historical request','2026-08-30','2026-08-01T00:00:00Z','Synthetic historical response')",[historical,lo.otherStudent,lo.org,closedHistorical,lo.student]);
  if(base.proof.sourceSHA256!==contract.appendMigration618.rawSHA256||base.proof.sharedPrivacy617!==true)throw Error('Exact current615+617+618 foundation required');
  const beforeData=await dataDigests(db),beforeMeta=await metadata(db),oldRequests=(await one<any>(db,"SELECT jsonb_agg(to_jsonb(r) ORDER BY id)d FROM data_subject_requests r")).d;
  const raw=readFileSync(contract.appendMigration023.path);if(sha(raw)!==contract.appendMigration023.rawSHA256)throw Error('Exact UC023 raw required');
  await db.exec('BEGIN');try{await db.exec(raw.toString('utf8'));await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}
  const afterData=await dataDigests(db),afterMeta=await metadata(db),afterOld=(await one<any>(db,"SELECT jsonb_agg(to_jsonb(r)-'deadline_details'-'deadline_revision' ORDER BY id)d FROM data_subject_requests r")).d;
  if(JSON.stringify(oldRequests)!==JSON.stringify(afterOld))throw Error('Historical old row projection changed');
  const oldTables=Object.keys(beforeData);for(const name of oldTables)if(name!=='public.data_subject_requests'&&JSON.stringify(beforeData[name])!==JSON.stringify(afterData[name]))throw Error('Unrelated old rowset changed '+name);
  const added=Object.keys(afterData).filter(x=>!oldTables.includes(x));if(JSON.stringify(added)!==JSON.stringify(['public.data_subject_request_deadline_events']))throw Error('Exactly one new history table required');
  const changed=['set_dsr_due_date()','get_documents_kpi(uuid)'];
  for(const f of beforeMeta.functions){const actual=afterMeta.functions.find((x:any)=>x.signature===f.signature);if(!actual||JSON.stringify(actual.metadata)!==JSON.stringify(f.metadata)||(!changed.includes(f.signature)&&actual.source_md5!==f.source_md5))throw Error('Unreviewed old function change '+f.signature);}
  for(const key of ['roles','defaults','memberships','settings'])if(JSON.stringify(beforeMeta[key])!==JSON.stringify(afterMeta[key]))throw Error('Old authority/default metadata changed '+key);
  const publicFns=['uc_dsr_create(uuid,uuid,text,text,text)','uc_dsr_list(uuid,uuid,jsonb,integer)','uc_dsr_apply(uuid,bigint,text,jsonb)'];
  const newFns=afterMeta.functions.filter((f:any)=>!beforeMeta.functions.some((b:any)=>b.signature===f.signature));if(newFns.length!==8)throw Error('Exact eight new functions required');
  for(const f of newFns){const acl=f.metadata.proacl??[];const expected=publicFns.includes(f.signature)?['authenticated=X/postgres','postgres=X/postgres']:['postgres=X/postgres'];if(JSON.stringify([...acl].sort())!==JSON.stringify(expected.sort()))throw Error('Exact new function ACL differs '+f.signature);}
  const direct=(await one<any>(db,"SELECT has_table_privilege('authenticated','public.data_subject_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('authenticated','public.data_subject_requests','SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege('anon','public.data_subject_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon','public.data_subject_requests','SELECT,INSERT,UPDATE,REFERENCES')bad")).bad;if(direct)throw Error('Direct client privilege remains');
  const appendFact={kind:'uc023_actual_dependency_and_preservation',sourceSHA256:sha(raw),actualKpiPreimage:'7b1d582dbaea5a699b554aa0e90e98b0',actualGuardBody:'16edf9d392db190610be2fa99c21c8f0',actualHistoricalRowsPreserved:true,allOtherOldRowsUnchanged:true,allOldFunctionMetadataAndOtherBodiesUnchanged:true,exactOneHistoryTableEightFunctions:true,noDirectClientTableOrColumnPrivileges:true,actual615And617NoFakeLedger:true,actual618CurrentWorkerBridge:true,actualAuthorityPredicatesNotStubbed:true};
  await caller(db,lo.owner);
  return {...base,contract,historical,closedHistorical,beforeData,beforeMeta,afterMeta,appendFact};
 }catch(error){await db.close();throw error;}
}
