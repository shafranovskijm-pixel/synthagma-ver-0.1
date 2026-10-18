import {readFileSync} from 'node:fs';
import {createUcDocumentReviewFixture} from './uc-document-review.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export const programFactsMigration=read('supabase/migrations/20261018111000_uc_program_facts.sql');
export async function installProgramFactsPrerequisites(db:any,installCaller=true){
 const baseline=JSON.parse(read('supabase/tests/fixtures/uc-program-facts-baseline.json'));
 for(const table of ['program_documents','program_folders','program_categories','student_groups','enrollments','student_group_memberships']){
  const existing=new Set((await db.query<any>('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',['public',table])).rows.map(r=>r.column_name));
  for(const c of baseline.columns.filter((c:any)=>c.table===table&&!existing.has(c.column))){
   const type=c.type.startsWith('_')?c.type.slice(1)+'[]':c.type;
   await db.exec(`ALTER TABLE ${table} ADD COLUMN ${c.column} ${type}${c.default?' DEFAULT '+c.default:''}`);
  }
 }
 await db.exec(`ALTER TABLE program_documents ADD PRIMARY KEY(id);ALTER TABLE program_folders ADD PRIMARY KEY(id);
 ALTER TABLE enrollments ALTER COLUMN id SET DEFAULT gen_random_uuid();CREATE UNIQUE INDEX uc_fixture_enrollment_identity ON enrollments(user_id,course_id);
 INSERT INTO storage.buckets VALUES('program-files',false);
 `);
 for(const f of baseline.functions.filter((f:any)=>f.signature.startsWith('sync_')))await db.exec(f.definition);
 for(const t of baseline.triggers.filter((t:any)=>t.name==='sync_profile_group_course_enrollment_trigger'||t.name==='sync_group_course_enrollments_trigger'))await db.exec(t.definition);
 const issuance=JSON.parse(read('supabase/tests/fixtures/uc-program-issuance-baseline.json'));
 for(const f of issuance.filter((f:any)=>['auto_create_education_document','issue_education_document_batch'].includes(f.proname)))await db.exec(f.definition);
 for(const t of baseline.triggers.filter((t:any)=>t.name==='trigger_auto_create_education_document'))await db.exec(t.definition);
 if(installCaller)await db.exec(read('supabase/migrations/20261018106000_uc_gorel_draft_caller.sql'));
 const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 for(const p of baseline.policies.filter((p:any)=>p.schemaname==='storage'))await db.exec(`CREATE POLICY ${q(p.policyname)} ON storage.objects AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
}
export async function createUcProgramFactsFixture(apply=true){
 const db=await createUcDocumentReviewFixture();
 await installProgramFactsPrerequisites(db);
 if(apply)await db.exec(programFactsMigration);
 return db;
}
