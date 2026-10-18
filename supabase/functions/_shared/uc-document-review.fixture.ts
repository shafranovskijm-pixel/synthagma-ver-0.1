import {readFileSync} from 'node:fs';
import {createUcGorelDraftFixture} from './uc-gorel-draft.fixture';
export const documentReviewMigration=readFileSync('supabase/migrations/20261018110000_uc_document_internal_review.sql','utf8').replace(/\r\n/g,'\n');
export async function createUcDocumentReviewFixture(apply=true){
 const db=await createUcGorelDraftFixture(false);
 const baseline=JSON.parse(readFileSync('supabase/tests/fixtures/uc-document-review-auth-baseline.json','utf8'));
 for(const f of baseline.functions)await db.exec(f.definition);
 if(apply)await db.exec(documentReviewMigration);
 return db;
}
