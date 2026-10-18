// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createUcGorelDraftFixture} from './uc-gorel-draft.fixture';
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org='7237f9d4-3670-4a19-8946-a43c68fd3473',owner=id(1),teacher=id(2),viewer=id(3),group=id(4),otherGroup=id(5),staff=id(6),operation=id(7);
const kinds=['enrollment_order','expulsion_order','student_list','class_journal','schedule','attestation_sheet','registration_book','title_page','pass'];
const docs=(version=1)=>kinds.map((doc_type,i)=>({doc_type,name:`Synthetic ${doc_type}`,doc_status:'draft',document_number:null,layout_format:'docx_ooxml',file_path:`organizations/${org}/group-documents/${group}/${id(version*100+i)}.docx`,template_registry_key:`synthetic-${doc_type}`,template_version_label:'v1',template_sha256:'A'.repeat(64),docx_sha256:'B'.repeat(64),variables_snapshot:{source:'synthetic'},generation_status:'generated',pdf_status:'unavailable'}));
let db:PGlite;
const as=async(u:string|null,role='authenticated')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${u||''}',false);SELECT set_config('request.jwt.claim.role','${role}',false);SET ROLE ${role};`);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const denied=async(sql:string,args:any[]=[],match=/denied|permission|scope|actor|stage|required/i)=>{await db.exec('SAVEPOINT rejected');await expect(db.query(sql,args)).rejects.toThrow(match);await db.exec('ROLLBACK TO rejected');};
const baseSql='SELECT * FROM create_goreltech_group_document_batch($1,$2,$3,$4)';
const onceSql='SELECT create_goreltech_group_document_batch_once($1,$2,$3,$4,$5,$6) result';
const stageSql='SELECT register_goreltech_group_document_stage($1,$2,$3,$4) result';
async function stage(actor=owner,data=docs()){
 await as(null,'service_role');await db.exec('RESET ROLE');
 for(const d of data)await db.query("INSERT INTO storage.objects(bucket_id,name)VALUES('billing-documents',$1) ON CONFLICT DO NOTHING",[d.file_path]);
 await as(null,'service_role');return row(stageSql,[actor,org,group,JSON.stringify(data)]);
}
beforeAll(async()=>{
 db=await createUcGorelDraftFixture(false);
 const migration=readFileSync('supabase/migrations/20261018106000_uc_gorel_draft_caller.sql','utf8');
 await expect(db.exec(migration.replace('COMMIT;',()=>"DO $$BEGIN RAISE EXCEPTION 'late migration failure';END$$;COMMIT;"))).rejects.toThrow(/late migration failure/);
 await db.exec('ROLLBACK');expect(await row("SELECT to_regclass('uc_goreltech_document_stages') IS NULL absent")).toEqual({absent:true});
 await db.exec(migration);
},30000);
beforeEach(async()=>{
 await db.exec(`RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false);
 INSERT INTO organizations(id,name,inn)VALUES('${org}','Synthetic ГОРЭЛТЕХ','7806541216');
 INSERT INTO profiles(user_id,organization_id)VALUES('${owner}','${org}'),('${teacher}','${org}'),('${viewer}','${org}');
 INSERT INTO user_roles VALUES('${owner}','organization'),('${viewer}','admin');
 INSERT INTO admin_staff(user_id,role)VALUES('${viewer}','viewer');
 INSERT INTO student_groups(id,organization_id,name)VALUES('${group}','${org}','Assigned'),('${otherGroup}','${org}','Other');
 INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES('${staff}','${teacher}','${org}','teacher','["documents.read","documents.write"]');`);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,staff,[group]]);
});
afterEach(async()=>db.exec('RESET ROLE;ROLLBACK'));
afterAll(async()=>db?.close());
it('does not expose private stages or service registration to ordinary callers',async()=>{
 for(const u of [owner,teacher,viewer]){await as(u);await denied('SELECT * FROM uc_goreltech_document_stages');await denied(stageSql,[u,org,group,JSON.stringify(docs())]);}
 await as(null,'anon');await denied(stageSql,[owner,org,group,JSON.stringify(docs())]);await denied(baseSql,[owner,org,group,JSON.stringify(docs())]);
 await as(null,'service_role');await denied(baseSql,[owner,org,group,JSON.stringify(docs())]);await denied(onceSql,[owner,org,group,operation,JSON.stringify(docs()),[]]);
});
it('requires exact server confirmation and rejects forged body, actor and group',async()=>{
 await stage(owner);await as(owner);
 await denied(baseSql,[owner,org,group,JSON.stringify(docs().map((d,i)=>i?d:{...d,docx_sha256:'C'.repeat(64)}))]);
 await denied(baseSql,[teacher,org,group,JSON.stringify(docs())]);
 await denied(baseSql,[owner,org,otherGroup,JSON.stringify(docs())]);
 await as(teacher);await denied(baseSql,[teacher,org,group,JSON.stringify(docs())]);
});
it('commits nine owner drafts with no number and consumes confirmation only once',async()=>{
 await stage();await as(owner);const result=await row(baseSql,[owner,org,group,JSON.stringify(docs())]);expect(result).toMatchObject({inserted_count:9,batch_version:1});
 expect(await row('SELECT count(*)::int n FROM group_documents WHERE doc_status=\'draft\' AND document_number IS NULL AND created_by=$1',[owner])).toEqual({n:9});
 await denied(baseSql,[owner,org,group,JSON.stringify(docs())]);
 await as(null,'service_role');await denied(stageSql,[owner,org,group,JSON.stringify(docs())],/consumed/);
 await db.exec('RESET ROLE');expect(await row('SELECT count(*)::int n FROM education_document_records')).toEqual({n:0});
});
it('assigned writer commits and replays the same operation receipt without re-consuming',async()=>{
 await stage(teacher);await as(teacher);
 const first=(await row(onceSql,[teacher,org,group,operation,JSON.stringify(docs()),['Synthetic warning']])).result;
 const replay=(await row(onceSql,[teacher,org,group,operation,'[]',[]])).result;
 expect(replay).toEqual(first);expect(first.batch).toMatchObject({inserted_count:9,batch_version:1});
 await db.exec('RESET ROLE');expect(await row('SELECT count(*)::int n FROM goreltech_document_operations')).toEqual({n:1});
 expect(await row('SELECT count(*)::int n FROM uc_goreltech_document_stages WHERE consumed_at IS NOT NULL')).toEqual({n:1});
});
it('expires confirmation and rechecks revoked assignment and platform viewer at commit time',async()=>{
 await stage(teacher);await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,1)',[org,staff,[]]);await as(teacher);
 await denied(baseSql,[teacher,org,group,JSON.stringify(docs())]);
 await stage(viewer);await as(viewer);await denied(baseSql,[viewer,org,group,JSON.stringify(docs())]);
 await stage(owner);await db.exec(`RESET ROLE;UPDATE uc_goreltech_document_stages SET created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 minute' WHERE actor_id='${owner}';`);
 await as(owner);await denied(baseSql,[owner,org,group,JSON.stringify(docs())]);
});
it('validates service metadata and still enforces all nine exact draft types',async()=>{
 await stage();await as(null,'service_role');
 await denied(stageSql,[owner,org,group,JSON.stringify(docs().map((d,i)=>i?d:{...d,template_sha256:'fake'}))],/metadata/);
 await denied(stageSql,[owner,org,group,JSON.stringify(docs().map((d,i)=>i?d:{...d,file_path:'missing.docx'}))],/metadata/);
 const wrong=docs().map((d,i)=>i?d:{...d,doc_type:'invented'});await stage(owner,wrong);await as(owner);
 await denied(baseSql,[owner,org,group,JSON.stringify(wrong)],/types/);
 await denied(baseSql,[owner,org,group,JSON.stringify(docs().slice(1))],/exactly 9/);
 await denied(baseSql,[owner,org,group,JSON.stringify(docs().map((d,i)=>i?d:{...d,document_number:'1'}))],/without official numbers/);
});
it('late receipt failure rolls back consumption, new rows and previous current flags',async()=>{
 await stage();await as(owner);await row(onceSql,[owner,org,group,operation,JSON.stringify(docs()),[]]);
 await stage(owner,docs(2));await db.exec(`RESET ROLE;CREATE FUNCTION fail_gorel_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'late receipt failure';END$$;CREATE TRIGGER fail_gorel_receipt BEFORE INSERT ON goreltech_document_operations FOR EACH ROW EXECUTE FUNCTION fail_gorel_receipt();`);
 await as(owner);await denied(onceSql,[owner,org,group,id(8),JSON.stringify(docs(2)),[]],/late receipt failure/);
 await db.exec('RESET ROLE');expect(await row('SELECT count(*)::int n FROM group_documents WHERE is_current')).toEqual({n:9});
 expect(await row('SELECT count(*)::int n FROM group_documents')).toEqual({n:9});
 expect(await row('SELECT count(*)::int n FROM uc_goreltech_document_stages WHERE consumed_at IS NULL')).toEqual({n:1});
});
