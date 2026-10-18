import { readFileSync } from 'node:fs';
import { createUcGorelDraftFixture } from './uc-gorel-draft.fixture';
export const educationProfileMigration=readFileSync('supabase/migrations/20261018108000_uc_education_compliance_profile.sql','utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
export async function createUcEducationProfileFixture(apply=true) {
 const db=await createUcGorelDraftFixture(false);
 // Preserve the actual production authorization implementations, not a fixture permission stub.
 const auth=JSON.parse(readFileSync('supabase/tests/fixtures/uc-education-profile-auth-baseline.json','utf8'));
 for(const f of auth.functions)await db.exec(f.definition);
 if(apply) { await db.exec('BEGIN'); await db.exec(educationProfileMigration); await db.exec('COMMIT'); }
 return db;
}

