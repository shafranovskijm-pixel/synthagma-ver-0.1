import {readFileSync} from 'node:fs';
import {createUcEducationProfileFixture} from './uc-education-profile.fixture';
export const signatureFilesMigration=readFileSync('supabase/migrations/20261018109000_uc_signature_token_files.sql','utf8').replace(/\r\n/g,'\n');
export async function installSignatureFilesPrerequisites(db:any){
 await db.exec('ALTER TABLE storage.objects ADD COLUMN owner uuid,ADD COLUMN owner_id text;CREATE UNIQUE INDEX signature_fixture_object_key ON storage.objects(bucket_id,name);');
 const baseline=JSON.parse(readFileSync('supabase/tests/fixtures/uc-signature-files-baseline.json','utf8'));
 for(const f of baseline.functions.filter((f:any)=>['create_external_contract_signature','add_signature_revision'].includes(f.proname)))await db.exec(f.definition);
 await db.exec('CREATE TABLE IF NOT EXISTS org_notifications(id uuid DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,type text,title text,message text,related_id uuid);');
}
export async function createUcSignatureFilesFixture(apply=true){
 const db=await createUcEducationProfileFixture();
 await installSignatureFilesPrerequisites(db);
 if(apply)await db.exec(signatureFilesMigration);
 return db;
}
