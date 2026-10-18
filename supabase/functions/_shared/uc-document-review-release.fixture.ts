import {readFileSync} from 'node:fs';
import {createUcSignatureFilesFixture} from './uc-signature-files.fixture';
import {documentReviewMigration} from './uc-document-review.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export async function createUcDocumentReviewReleaseFixture(applyReview=false){
 const db=await createUcSignatureFilesFixture();
 // Scheduler jobs are witnesses only; never re-execute historical scheduler SQL.
 await db.exec(read('supabase/migrations/20261018106000_uc_gorel_draft_caller.sql'));
 const previous=JSON.parse(read('docs/releases/sintagma-production/uc-education-profile-20261018/release-manifest.json'));
 for(const m of [...previous.priorMigrations,...previous.migrations])
  await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',
   [m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 if(applyReview)await db.exec(documentReviewMigration);
 return db;
}
