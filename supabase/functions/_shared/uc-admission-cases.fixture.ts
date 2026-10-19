import {readFileSync} from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {createUcIdentificationFixture} from './uc-identification-private-review.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
export const admissionMigration=read('supabase/migrations/20261019115000_uc_admission_cases.sql');
export const admissionBaseline=JSON.parse(read('supabase/tests/fixtures/uc-admission-cases-baseline.json'));
export async function createUcAdmissionFixture(apply=true,options:{beforeAdmission?:(db:PGlite)=>Promise<void>}={}){
 const db=await createUcIdentificationFixture(true);
 const prior=JSON.parse(read('docs/releases/sintagma-production/uc-identification-private-review-20261019/manifest.json'));
 for(const m of prior.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 await db.exec('CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz)');
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 const tables=['student_identity_documents','student_documents','org_contracts'];
 for(const t of tables){
  await db.exec(`CREATE TABLE IF NOT EXISTS public.${quote(t)}(uc115_fixture_placeholder boolean)`);
  for(const c of admissionBaseline.metadata.columns.filter((c:any)=>c.table===t)){
   const type=c.type.startsWith('_')?c.type.slice(1)+'[]':c.type;
   await db.exec(`ALTER TABLE public.${quote(t)} ADD COLUMN IF NOT EXISTS ${quote(c.column)} ${type}`);
   if(c.default)await db.exec(`ALTER TABLE public.${quote(t)} ALTER COLUMN ${quote(c.column)} SET DEFAULT ${c.default}`);
  }
 }
 await options.beforeAdmission?.(db);
 if(apply)await db.exec(admissionMigration);
 return db;
}
