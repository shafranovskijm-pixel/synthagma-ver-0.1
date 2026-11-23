import {installActualFrdoNativeAuth} from '../../tests/native/frdo-packets/frdo-packets.actual-runtime';
import {readFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {createUcAdmissionFixture} from './uc-admission-cases.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export const groupEducationMigration=()=>read('supabase/migrations/20261019120000_uc_group_education_facts.sql');
export const groupEducationBaseline=JSON.parse(read('supabase/tests/fixtures/uc-group-education-facts-baseline.json'));
export const groupEducationId=(n:number)=>'f0000116-0000-4000-8000-'+String(n).padStart(12,'0');
export const groupEducationIds=Object.freeze({organization:groupEducationId(1),foreignOrganization:groupEducationId(2),owner:groupEducationId(3),reviewer:groupEducationId(4),student:groupEducationId(5),writer:groupEducationId(6),reader:groupEducationId(7),teacher:groupEducationId(8),viewer:groupEducationId(9),sales:groupEducationId(10),expired:groupEducationId(11),revoked:groupEducationId(12),teacherStaff:groupEducationId(13),course:groupEducationId(20),group:groupEducationId(21),otherGroup:groupEducationId(22),enrollment:groupEducationId(23),document:groupEducationId(24),program:groupEducationId(25)});
export type GroupEducationDb=Pick<PGlite,'exec'|'query'|'close'>;

/** Exact captured existing B-tree indexes for synthetic runtime fidelity only. */
export async function restoreGroupEducationSourceIndexes(db:GroupEducationDb){
 for(const index of groupEducationBaseline.fixtureSelection.indexes){
  const found=(await db.query<any>("SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='public'AND indexname=$1",[index.name])).rows[0];
  if(found&&(found.tablename!==index.table||found.indexdef!==index.definition))throw Error('Actual source index mismatch: '+index.name);
  if(!found)await db.exec(index.definition);
  const actual=(await db.query<any>("SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='public'AND indexname=$1",[index.name])).rows[0];
  if(actual?.tablename!==index.table||actual?.indexdef!==index.definition)throw Error('Actual source index installation mismatch: '+index.name);
 }
}

export async function executeAsGroupEducationCaller(db:GroupEducationDb,user:string|null,role='authenticated'){
 if(!['authenticated','service_role','anon'].includes(role))throw Error('Unknown synthetic role');
 await db.exec('RESET ROLE');await installActualFrdoNativeAuth(db);await db.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claim','',false),set_config('request.jwt.claims',$1,false)",[JSON.stringify({iss:'https://fixture.supabase.co/auth/v1',role,...(user?{sub:user}:{})})]);await db.exec('SET ROLE '+role);
}
export async function groupEducationRow<T=any>(db:GroupEducationDb,sql:string,args:any[]=[]):Promise<T>{return(await db.query<T>(sql,args)).rows[0];}

/** Extends100..115; exact selected actual17.6 FK/trigger definitions, not old
 * fixture omissions or simulated cascade/helper calls. Selection and limits
 * are explicit in the captured baseline. No authority function is stubbed. */
export async function createUcGroupEducationFixture(apply=true,options:{beforeGroupEducation?:(db:PGlite)=>Promise<void>}={}){
 const db=await createUcAdmissionFixture(true);
 const prior=JSON.parse(read('docs/releases/sintagma-production/uc-admission-cases-20261019/manifest.json'));
 for(const m of prior.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 // Only the three actual post609 private monthly relations are newly created.
 const monthly=groupEducationBaseline.fixtureSelection.monthlyQuota;
 for(const name of monthly.tables){
  const r=groupEducationBaseline.relations.find((v:any)=>v.name===name);
  if(!r||r.kind!=='r'||!r.rls||r.force_rls||r.policies.length||r.columns.some((c:any)=>c.identity||c.generated)||r.acl?.join(',')!=='postgres=arwdDxtm/postgres')throw Error('Unreviewed monthly relation metadata: '+name);
  await db.exec(`CREATE TABLE public.${q(name)}(${r.columns.map((c:any)=>q(c.name)+' '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.not_null?' NOT NULL':'')).join(',')})`);
  await db.exec(`ALTER TABLE public.${q(name)} OWNER TO ${q(r.owner)};ALTER TABLE public.${q(name)} ENABLE ROW LEVEL SECURITY;REVOKE ALL ON TABLE public.${q(name)} FROM PUBLIC,anon,authenticated,service_role`);
  for(const c of r.constraints.filter((v:any)=>v.kind==='c'))await db.exec(`ALTER TABLE public.${q(name)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 }
 for(const r of groupEducationBaseline.relations){
  for(const c of r.columns){
   await db.exec(`ALTER TABLE public.${q(r.name)} ADD COLUMN IF NOT EXISTS ${q(c.name)} ${c.type}`);
   if(c.default)await db.exec(`ALTER TABLE public.${q(r.name)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  }
 }
 // Supporting empty synthetic billing relations execute the captured real
 // capacity/quota body; no agreement/usage/permission decision is fabricated.
 await db.exec(`CREATE TABLE IF NOT EXISTS organization_billing_agreements(id uuid DEFAULT gen_random_uuid(),organization_id uuid,effective_from date,effective_to date);
 CREATE TABLE IF NOT EXISTS organization_usage(organization_id uuid,month_start date,students_added_count integer NOT NULL DEFAULT 0,PRIMARY KEY(organization_id,month_start));
 CREATE UNIQUE INDEX IF NOT EXISTS uc116_fixture_user_role_identity ON user_roles(user_id);
 CREATE UNIQUE INDEX IF NOT EXISTS profiles_membership_tenant_key ON profiles(user_id,organization_id);
 CREATE UNIQUE INDEX IF NOT EXISTS student_groups_membership_tenant_key ON student_groups(id,organization_id);
 CREATE UNIQUE INDEX IF NOT EXISTS student_groups_id_organization_registration_key ON student_groups(id,organization_id);
 CREATE UNIQUE INDEX IF NOT EXISTS uc116_fixture_course_identity ON courses(id,organization_id);
 `);
 const needed=new Set(groupEducationBaseline.fixtureSelection.triggers.map((t:any)=>t.function));
 const seq=groupEducationBaseline.fixtureSelection.sequence;
 await db.exec(`CREATE SEQUENCE IF NOT EXISTS public.${q(seq.name)} AS ${seq.data_type} INCREMENT BY ${seq.increment_by} MINVALUE ${seq.minimum_value} MAXVALUE ${seq.maximum_value} START WITH ${seq.start_value} CACHE ${seq.cache_size} ${seq.cycle?'CYCLE':'NO CYCLE'}`);
 for(const signature of ['create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)','get_organization_student_capacity(uuid,integer)','add_students_to_groups(uuid,uuid[],uuid[])','account_deletion_erase_data(uuid,text)','account_deletion_personal_row_counts(uuid)','account_deletion_snapshot(uuid)','uc_guard_program_artifact()'])needed.add(signature);
 for(const signature of monthly.functions)needed.add(signature);
 for(const signature of needed){
  const f=groupEducationBaseline.functions.find((v:any)=>v.signature===signature);if(!f)throw Error('Missing actual source function: '+signature);
  await db.exec(f.definition);
  await db.exec(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated,service_role`);
  if(/[{,]=X\//.test(f.acl??''))await db.exec(`GRANT EXECUTE ON FUNCTION public.${signature} TO PUBLIC`);
  for(const role of ['anon','authenticated','service_role'])if((f.acl??'').includes(role+'=X/'))await db.exec(`GRANT EXECUTE ON FUNCTION public.${signature} TO ${role}`);
 }
 // The actual legacy bulk receiver names this exact primary constraint in
 // ON CONFLICT ON CONSTRAINT; a merely equivalent unique index is insufficient.
 for(const key of groupEducationBaseline.fixtureSelection.primaryKeys){
  const found=(await db.query<any>('SELECT pg_get_constraintdef(oid,true)d FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',['public.'+key.table,key.name])).rows[0];
  if(found&&found.d!==key.definition)throw Error('Actual primary key mismatch: '+key.name);
  if(!found)await db.exec(`ALTER TABLE public.${q(key.table)} ADD CONSTRAINT ${q(key.name)} ${key.definition}`);
 }
 for(const f of groupEducationBaseline.fixtureSelection.foreignKeys){
  const found=(await db.query<any>('SELECT pg_get_constraintdef(oid,true)d FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',['public.'+f.table,f.name])).rows[0];
  if(found&&found.d!==f.definition)await db.exec(`ALTER TABLE public.${q(f.table)} DROP CONSTRAINT ${q(f.name)}`);
  if(!found||found.d!==f.definition)await db.exec(`ALTER TABLE public.${q(f.table)} ADD CONSTRAINT ${q(f.name)} ${f.definition}`);
 }
 await restoreGroupEducationSourceIndexes(db);
 for(const t of groupEducationBaseline.fixtureSelection.triggers){await db.exec(`DROP TRIGGER IF EXISTS ${q(t.name)} ON public.${q(t.table)}`);await db.exec(t.definition);if(t.enabled==='D')await db.exec(`ALTER TABLE public.${q(t.table)} DISABLE TRIGGER ${q(t.name)}`);}
 await options.beforeGroupEducation?.(db);
 if(apply){const sql=groupEducationMigration();try{await db.exec(sql);}catch(error:any){const pos=Number(error.position??error.internalPosition);error.message+='\nSQL116 position '+pos+' '+(error.internalQuery??sql.slice(Math.max(0,pos-180),pos+180));await db.close();throw error;}}
 return db;
}

/** Public UC010 review and UC111 programme/binding operations establish source
 * proof. UC013 state is NEVER inserted by this seed: callers must invoke the
 * real initialize_history RPC. Can run unchanged on the nativePG17 adapter. */
export async function seedGroupEducationScenario(db:GroupEducationDb){
 const i=groupEducationIds;let sequence=1000;const request=()=>groupEducationId(++sequence);
 await db.exec('RESET ROLE');await installActualFrdoNativeAuth(db);await db.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claim','',false),set_config('request.jwt.claims',$1,false)",[JSON.stringify({iss:'https://fixture.supabase.co/auth/v1',role:'service_role'})]);
 await db.query("INSERT INTO organizations(id,name,subscription_plan,custom_max_students,custom_max_courses)VALUES($1,'Synthetic116 source','professional',100000,100000),($2,'Synthetic116 foreign','professional',100000,100000)",[i.organization,i.foreignOrganization]);
 for(const u of[i.owner,i.reviewer,i.student,i.writer,i.reader,i.teacher,i.viewer,i.sales,i.expired,i.revoked]){await db.query('INSERT INTO auth.users(id)VALUES($1)',[u]);await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)",[u,i.organization,u===i.student?'Synthetic116 Learner':u===i.teacher?'Synthetic116 Teacher':'Synthetic116 Staff']);}
 await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'organization'),($2,'student'),($3,'admin'),($4,'sales_manager')",[i.owner,i.student,i.viewer,i.sales]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[i.viewer]);
 for(const u of[i.reviewer,i.writer,i.expired,i.revoked])await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.read\",\"students.write\",\"documents.read\",\"documents.write\"]')",[u,i.organization]);
 await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.read\",\"documents.read\"]')",[i.reader,i.organization]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"students.read\",\"documents.read\",\"students.write\",\"documents.write\"]')",[i.teacherStaff,i.teacher,i.organization]);
 await db.query("UPDATE org_staff SET expires_at=now()-interval'1 day'WHERE user_id=$1",[i.expired]);await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[i.revoked]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Synthetic116 mutable course')",[i.course,i.organization]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Synthetic116 group'),($4,$2,$3,'Synthetic116 other group')",[i.group,i.organization,i.course,i.otherGroup]);
 await executeAsGroupEducationCaller(db,i.owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[i.organization,i.teacherStaff,[i.group]]);
 const fileRequest=request(),path=i.organization+'/versions/'+i.document+'/'+fileRequest+'.pdf';await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"synthetic116-file\",\"mimetype\":\"application/pdf\"}')",[path]);
 await executeAsGroupEducationCaller(db,i.owner);await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Synthetic116 programme source','program_approval','active')",[i.document,i.organization]);
 const version=(await groupEducationRow(db,'SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5)d',[i.document,i.organization,fileRequest,JSON.stringify({file_path:path,file_name:'Synthetic116.pdf',file_size:42,change_summary:'Synthetic116 source'}),JSON.stringify({status:'active'})])).d;
 const docRevision=(await groupEducationRow(db,'SELECT document_revision r FROM org_documents WHERE id=$1',[i.document])).r;
 let review=(await groupEducationRow(db,'SELECT save_org_document_review_draft($1,$2,$3,0,$4,$5,$6,$7)d',[i.document,version.version_id,docRevision,i.owner,i.reviewer,'[]',request()])).d;
 review=(await groupEducationRow(db,"SELECT transition_org_document_review($1,$2,$3,'submit',NULL,NULL,NULL,$4)d",[review.id,review.revision,docRevision,request()])).d;
 await executeAsGroupEducationCaller(db,i.reviewer);review=(await groupEducationRow(db,"SELECT transition_org_document_review($1,$2,$3,'approve',NULL,'SYNTHETIC/116','2026-10-19',$4)d",[review.id,review.revision,docRevision,request()])).d;
 const facts={schema_version:1,full_title:'Synthetic116 reviewed programme',program_type:'dpo_upskilling',academic_hours:72,training_form:'part_time',uses_elearning:true,uses_distance_learning:true,duration_calendar:'Two weeks',attestation_form:'Synthetic final test',attestation_criteria:'Human reviewed synthetic criteria',qualification:null,profession:null};
 await executeAsGroupEducationCaller(db,i.owner);let pv=(await groupEducationRow(db,'SELECT create_program_facts_version($1,$2,$3,NULL,$4,$5,$6,0,$7)d',[i.organization,i.program,'Synthetic116 programme',version.version_id,i.reviewer,JSON.stringify(facts),request()])).d;
 pv=(await groupEducationRow(db,"SELECT transition_program_facts_version($1,$2,'submit',NULL,$3)d",[pv.id,pv.revision,request()])).d;
 await executeAsGroupEducationCaller(db,i.reviewer);pv=(await groupEducationRow(db,"SELECT transition_program_facts_version($1,$2,'approve',NULL,$3)d",[pv.id,pv.revision,request()])).d;
 await executeAsGroupEducationCaller(db,i.owner);await db.query('SELECT bind_course_program_version($1,$2,$3,0,$4)',[i.organization,i.course,pv.id,request()]);
 for(const group of[i.group,i.otherGroup])await db.query('SELECT bind_group_program_version($1,$2,$3,$4,0,$5)',[i.organization,group,i.course,pv.id,request()]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3)',[i.organization,i.group,i.student]);await db.query("INSERT INTO enrollments(id,user_id,course_id,status)VALUES($1,$2,$3,'active')",[i.enrollment,i.student,i.course]);
 await executeAsGroupEducationCaller(db,i.owner);
 return{ids:i,facts,file:{document_id:i.document,version_id:version.version_id,review_id:review.id},programVersion:pv,request,
  executeAsCaller:(user:string|null,role='authenticated')=>executeAsGroupEducationCaller(db,user,role),
  read:(query:any,group=i.group)=>groupEducationRow(db,'SELECT read_group_education_facts($1,$2,$3)d',[i.organization,group,JSON.stringify(query)]).then((v:any)=>v.d),
  apply:(expectedRevision:number,action:any,requestId=request(),group=i.group)=>groupEducationRow(db,'SELECT apply_group_education_facts_action($1,$2,$3,$4,$5)d',[i.organization,group,expectedRevision,requestId,JSON.stringify(action)]).then((v:any)=>v.d),
 };
}
