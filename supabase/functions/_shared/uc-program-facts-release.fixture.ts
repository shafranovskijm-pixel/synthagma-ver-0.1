import {readFileSync} from 'node:fs';
import {createUcDocumentReviewReleaseFixture} from './uc-document-review-release.fixture';
import {installProgramFactsPrerequisites,programFactsMigration} from './uc-program-facts.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export async function createUcProgramFactsReleaseFixture(apply=false){
 const db=await createUcDocumentReviewReleaseFixture(true);
 const prior=JSON.parse(read('docs/releases/sintagma-production/uc-document-review-20261018/release-manifest.json'));
 for(const m of prior.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 await installProgramFactsPrerequisites(db,false);
 if(apply)await db.exec(programFactsMigration);
 return db;
}
