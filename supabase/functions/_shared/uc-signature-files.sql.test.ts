// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcSignatureFilesFixture,signatureFilesMigration} from './uc-signature-files.fixture';
const id=(n:number)=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),foreign=id(2),owner=id(3),teacher=id(4),recipient=id(5),viewer=id(6),writer=id(7),reader=id(8);
const staff=id(10),group=id(11),otherGroup=id(12),doc=id(13),otherDoc=id(14),sig=id(15),otherSig=id(16),newSig=id(17);
const token='synthetic-file-token-0123456789012345',otherToken='synthetic-other-token-0123456789012345';
const key=(s=sig,n=20)=>org+'/signature-files/'+s+'/'+id(n)+'.pdf';
let db:PGlite;
const as=async(u:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(u||'')+"',false);SELECT set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
async function denied(sql:string,args:any[]=[],code='42501'){
 await db.exec('SAVEPOINT denied');
 try{await db.query(sql,args);throw new Error('Expected rejection');}catch(e:any){expect(e.code).toBe(code);}
 finally{await db.exec('ROLLBACK TO denied');}
}
const upload=async(path=key(),u=owner,bucket='external-contracts')=>db.query('INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)VALUES($1,$2,$3::uuid,$3::uuid::text,$4)',[bucket,path,u,JSON.stringify({size:20})]);
const reviseSql='SELECT add_signature_revision_v2($1,$2,$3,$4,$5,$6,$7,$8) id';
const reviseArgs=(over:any={})=>[over.id??id(30),over.sig??sig,over.expected??null,over.file??key(),over.name??'File.pdf','application/pdf',Object.hasOwn(over,'html')?over.html:'Current HTML',over.summary??'Synthetic revision'];
const createSql='SELECT create_external_contract_signature_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
const createArgs=(over:any={})=>[over.id??newSig,over.file??key(newSig),over.name??'File.pdf','application/pdf',over.title??'Synthetic external','recipient@example.invalid','Recipient',over.summary??'Initial',over.org??org];
const context=async(kind='revision',revision:string|null=null,t=token)=>row('SELECT uc_signature_file_context($1,$2,$3) data',[t,kind,revision]);
const visible=async(path:string)=>row("SELECT count(*)::int n FROM storage.objects WHERE bucket_id='external-contracts' AND name=$1",[path]);
beforeAll(async()=>{db=await createUcSignatureFilesFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false)");
 await db.query('INSERT INTO organizations(id,name)VALUES($1,$2),($3,$4)',[org,'Synthetic organization',foreign,'Foreign synthetic']);
 for(const [u,name] of [[owner,'Owner'],[teacher,'Teacher'],[recipient,'Recipient'],[writer,'Writer'],[reader,'Reader']])await db.query('INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)',[u,org,name]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'admin'),($3,'student')",[owner,viewer,recipient]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"documents.read\",\"documents.write\"]'),($4,$5,$3,'custom','[\"documents.read\",\"documents.write\"]'),($6,$7,$3,'custom','[\"documents.read\"]')",[staff,teacher,org,id(9),writer,id(18),reader]);
 await db.query("INSERT INTO student_groups(id,organization_id,name)VALUES($1,$2,'Assigned'),($3,$2,'Unassigned')",[group,org,otherGroup]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,staff,[group]]);
 await db.exec('RESET ROLE');
 await db.query("INSERT INTO group_documents(id,organization_id,group_id,doc_type,name,html)VALUES($1,$2,$3,'student_list','Assigned','HTML'),($4,$2,$5,'student_list','Other','HTML')",[doc,org,group,otherDoc,otherGroup]);
 await db.query("INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_id,document_title,recipient_type,recipient_email,recipient_name,recipient_user_id,status,mode,document_html,signature_token) VALUES($1,$2,$3,'contract',$4,'Assigned contract','student','recipient@example.invalid','Recipient',$5,'in_review','review','Current HTML',$6),($7,$2,$3,'contract',$8,'Other contract','student','other@example.invalid','Other',NULL,'in_review','review','Other HTML',$9)",[sig,org,owner,doc,recipient,token,otherSig,otherDoc,otherToken]);
 await as(owner);
});
afterEach(async()=>db.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());

it('creates one invitation/revision from exact own staged bytes and replays same UUID without a second row',async()=>{
 await upload(key(newSig));expect((await row(createSql,createArgs())).id).toBe(newSig);
 expect((await row(createSql,createArgs())).id).toBe(newSig);
 expect(await row('SELECT count(*)::int n FROM signature_revisions WHERE signature_id=$1',[newSig])).toEqual({n:1});
});
it('initial request replay rejects changed body, actor, organization and object',async()=>{
 await upload(key(newSig));await row(createSql,createArgs());await upload(key(newSig,21));
 for(const over of [{title:'Other'},{file:key(newSig,21)},{summary:'Different'},{org:foreign}])
  await denied(createSql,createArgs(over),over.org?'42501':'22023');
 await as(writer);await denied(createSql,createArgs(),'22023');
});
it.each([teacher,recipient,viewer,reader])('denies initial org-wide upload/invitation by limited actor %s',async(user)=>{
 await as(user);await denied("INSERT INTO storage.objects(bucket_id,name,owner_id)VALUES('external-contracts',$1,$2)",[key(newSig),user]);
 await denied(createSql,createArgs());
});
it('denies anonymous and service-only initial RPC without an original caller',async()=>{
 await as(null,'anon');await denied(createSql,createArgs());await as(null,'service_role');await denied(createSql,createArgs());
});
it('rolls the new invitation back if the late initial revision insert fails',async()=>{
 await upload(key(newSig));await db.exec("RESET ROLE;CREATE FUNCTION pg_temp.reject_new_revision()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic late failure';END$$;CREATE TRIGGER late_failure BEFORE INSERT ON signature_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_new_revision()");
 await as(owner);await denied(createSql,createArgs(),'P0001');
 expect(await row('SELECT count(*)::int n FROM document_signatures WHERE id=$1',[newSig])).toEqual({n:0});
});
it('allows assigned teacher staging/revision and exact same request replay',async()=>{
 await as(teacher);await upload(key(),teacher);expect(await visible(key())).toEqual({n:1});
 expect((await row(reviseSql,reviseArgs())).id).toBe(id(30));
 expect((await row(reviseSql,reviseArgs())).id).toBe(id(30));
 expect(await row('SELECT count(*)::int n FROM signature_revisions WHERE signature_id=$1',[sig])).toEqual({n:1});
});
it('requires exact current revision CAS for new requests while same request replay survives later revisions',async()=>{
 await upload();await row(reviseSql,reviseArgs());await upload(key(sig,21));
 await denied(reviseSql,reviseArgs({id:id(31),file:key(sig,21)}),'40001');
 await row(reviseSql,reviseArgs({id:id(31),file:key(sig,21),expected:id(30)}));
 expect((await row(reviseSql,reviseArgs())).id).toBe(id(30));
 expect((await row('SELECT current_revision_id FROM document_signatures WHERE id=$1',[sig])).current_revision_id).toBe(id(31));
 await denied(reviseSql,reviseArgs({summary:'Forged replay'}),'22023');
});
it('serializes the legacy revision allocation and requires the same namespace/uploader',async()=>{
 await upload();expect((await row("SELECT add_signature_revision($1,$2,'File.pdf','application/pdf','Current HTML','Legacy compatible') id",[sig,key()])).id).toBeTruthy();
 const def=await row("SELECT pg_get_functiondef('add_signature_revision(uuid,text,text,text,text,text)'::regprocedure) body");expect(def.body).toContain('WHERE id = p_signature_id FOR UPDATE;');
});
it('denies unassigned and cross-signature staging even within the same tenant',async()=>{
 await as(teacher);await denied("INSERT INTO storage.objects(bucket_id,name,owner_id)VALUES('external-contracts',$1,$2)",[key(otherSig),teacher]);
 await denied(reviseSql,reviseArgs({sig:otherSig,file:key(otherSig)}));
});
it('rejects same-uploader foreign-signature pointer and forged created_by at INSERT',async()=>{
 await upload(key(otherSig),owner);await as(teacher);
 await denied("INSERT INTO signature_revisions(signature_id,version,file_url,created_by)VALUES($1,1,$2,$3)",[sig,key(otherSig),owner]);
 await denied(reviseSql,reviseArgs({file:key(otherSig)}));
});
it('rejects files uploaded by another actor even under the correct signature namespace',async()=>{
 await upload();await as(teacher);await denied(reviseSql,reviseArgs());
});
it('does not reuse former broad-role same-uploader uploads in an unrelated group',async()=>{
 await db.exec('RESET ROLE');await upload(key(otherSig),teacher);await as(teacher);
 await denied(reviseSql,reviseArgs({file:key(otherSig)}));expect(await visible(key(otherSig))).toEqual({n:0});
});
it('blocks owner metadata spoof and immutable staging overwrites/deletes before attachment',async()=>{
 await as(teacher);await denied("INSERT INTO storage.objects(bucket_id,name,owner,owner_id)VALUES('external-contracts',$1,$2,$3)",[key(),owner,teacher]);
 await upload(key(),teacher);
 expect((await db.query("UPDATE storage.objects SET metadata='{\"size\":999}' WHERE name=$1 RETURNING id",[key()])).rows).toEqual([]);
 expect((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[key()])).rows).toEqual([]);
 await denied("INSERT INTO storage.objects(bucket_id,name,owner_id)VALUES('external-contracts',$1,$2)",[org+'/'+id(99)+'.pdf',teacher]);
});
it('recipient can upload a canonical revision only for their own active invitation',async()=>{
 await as(recipient);await upload(key(),recipient);await row(reviseSql,reviseArgs());
 expect(await visible(key())).toEqual({n:1});
 await denied("INSERT INTO storage.objects(bucket_id,name,owner_id)VALUES('external-contracts',$1,$2)",[key(otherSig),recipient]);
});
it('service-only context returns exact canonical pointer and uploader proof',async()=>{
 await upload();await row(reviseSql,reviseArgs());await as(null,'service_role');
 const c=(await context()).data;expect(c).toMatchObject({signature_id:sig,revision_id:id(30),provenance_path:key(),locator:key(),bucket:'external-contracts'});
});
it.each(['anon','authenticated'])('context cannot be directly called as %s',async(role)=>{
 await as(recipient,role);await denied('SELECT uc_signature_file_context($1,$2,$3)',[token,'revision',null]);
});
it('token cannot select another signature revision; unknown/expired tokens deny',async()=>{
 await upload();await row(reviseSql,reviseArgs());await upload(key(otherSig));await row(reviseSql,reviseArgs({sig:otherSig,id:id(31),file:key(otherSig)}));
 await as(null,'service_role');await denied('SELECT uc_signature_file_context($1,$2,$3)',[token,'revision',id(31)],'P0002');
 await denied('SELECT uc_signature_file_context($1)',[token+'unknown'],'P0002');
 await db.exec('RESET ROLE');await db.query("UPDATE document_signatures SET expires_at=now()-interval '1 day' WHERE id=$1",[sig]);
 await as(null,'service_role');await denied('SELECT uc_signature_file_context($1)',[token],'55000');
});
it('legacy forged same-tenant references do not bypass authenticated assigned-group Storage RLS',async()=>{
 const flat=org+'/'+id(99)+'.pdf';
 await db.exec('RESET ROLE;ALTER TABLE signature_revisions DISABLE TRIGGER uc_revision_file_provenance');
 await upload(flat,owner);await as(owner);await db.exec('RESET ROLE');
 await db.query("INSERT INTO signature_revisions(id,signature_id,version,file_url,created_by)VALUES($1,$2,1,$3,$4)",[id(30),sig,flat,owner]);
 await db.exec('ALTER TABLE signature_revisions ENABLE TRIGGER uc_revision_file_provenance');
 await as(teacher);expect(await visible(flat)).toEqual({n:0});await as(recipient);expect(await visible(flat)).toEqual({n:0});
 await as(owner);expect(await visible(flat)).toEqual({n:1});await as(viewer);expect(await visible(flat)).toEqual({n:1});
 await as(null,'service_role');await denied('SELECT uc_signature_file_context($1,$2,$3)',[token,'revision',id(30)],'P0010');
});
it('legacy forged canonical cross-signature reference fails even when the same actor uploaded it',async()=>{
 await db.exec('RESET ROLE;ALTER TABLE signature_revisions DISABLE TRIGGER uc_revision_file_provenance');
 await upload(key(otherSig),teacher);await as(owner);await db.exec('RESET ROLE');
 await db.query("INSERT INTO signature_revisions(id,signature_id,version,file_url,created_by)VALUES($1,$2,1,$3,$4)",[id(30),sig,key(otherSig),teacher]);
 await db.exec('ALTER TABLE signature_revisions ENABLE TRIGGER uc_revision_file_provenance');
 await as(teacher);expect(await visible(key(otherSig))).toEqual({n:0});
 await as(null,'service_role');await denied('SELECT uc_signature_file_context($1,$2,$3)',[token,'revision',id(30)],'P0010');
});
it('snapshot mutation cannot mint access to another signature object',async()=>{
 await upload(key(otherSig));await denied('UPDATE document_signatures SET document_snapshot_url=$1 WHERE id=$2',[key(otherSig),sig]);
 await upload();await db.query('UPDATE document_signatures SET document_snapshot_url=$1 WHERE id=$2',[key(),sig]);
 await as(teacher);expect(await visible(key())).toEqual({n:1});
});
it('cannot insert a pending scan pointer or signed artifact before atomic finalization',async()=>{
 for(const column of ['handwritten_scan_path','signed_document_path'])await denied(
  "INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,recipient_type,recipient_email,recipient_name,status,"+column+")VALUES($1,$2,$3,'external_upload','Forged','student','recipient@example.invalid','Recipient','draft',$4)",
  [newSig,org,owner,key(otherSig)]);
});
it('HTML-only service creation remains compatible and file-backed service-only actor spoof is denied',async()=>{
 await as(null,'service_role');await db.exec('RESET ROLE');
 await db.query("INSERT INTO signature_revisions(id,signature_id,version,document_html,created_by)VALUES($1,$2,1,'Server-generated HTML',$3)",[id(30),sig,owner]);
 await upload();await denied("INSERT INTO signature_revisions(id,signature_id,version,file_url,created_by)VALUES($1,$2,2,$3,$4)",[id(31),sig,key(),owner]);
});
it('canonical files finalize once; exact request replay after signing never reopens the parent',async()=>{
 await upload();await row(reviseSql,reviseArgs());
 const hash=(await row("SELECT encode(sha256(convert_to('Current HTML','UTF8')),'hex') h")).h;
 await as(null,'service_role');
 const result=await row('SELECT uc_finalize_signature($1,$2,$3,$4,$5,true,NULL,NULL,NULL,NULL,$6,$7,$8) data',
  [token,hash,JSON.stringify({agreement_text:'Synthetic acceptance statement',email:'recipient@example.invalid',full_name:'Recipient'}),'pep',id(30),'external-contracts',key(),'a'.repeat(64)]);
 expect(result.data.success).toBe(true);
 expect((await context('source')).data.expected_hash).toBe('a'.repeat(64));
 await as(owner);expect((await row(reviseSql,reviseArgs())).id).toBe(id(30));
 expect((await row('SELECT status FROM document_signatures WHERE id=$1',[sig])).status).toBe('signed');
});
it('late notification failure rolls back revision/current pointer atomically',async()=>{
 await as(teacher);await upload(key(),teacher);await db.exec('RESET ROLE;ALTER TABLE org_notifications ADD CONSTRAINT synthetic_reject CHECK(false) NOT VALID');
 await as(teacher);await denied(reviseSql,reviseArgs(),'23514');
 expect(await row('SELECT count(*)::int n FROM signature_revisions WHERE signature_id=$1',[sig])).toEqual({n:0});
 expect((await row('SELECT current_revision_id FROM document_signatures WHERE id=$1',[sig])).current_revision_id).toBeNull();
});
it('released guard baselines reject unexpected drift instead of overwriting it',async()=>{
 await db.exec('RESET ROLE;SAVEPOINT drift;DROP FUNCTION uc_signature_file_context(text,text,uuid);CREATE OR REPLACE FUNCTION uc_signature_storage_read(p_bucket text,p_name text)RETURNS boolean LANGUAGE sql AS $$SELECT true$$');
 await expect(db.exec(signatureFilesMigration)).rejects.toThrow(/unreviewed provenance baseline/);await db.exec('ROLLBACK TO drift');
});
it('initial commercial sender keeps scoped sales creation and own staging recovery without documents.write',async()=>{
 await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"sales.write\"]' WHERE user_id=$1",[writer]);
 await as(writer);await upload(key(newSig),writer);expect(await visible(key(newSig))).toEqual({n:1});
 expect((await row(createSql,createArgs())).id).toBe(newSig);
});
it('exact receipt includes the original expected revision and cannot be read or forged by callers',async()=>{
 await upload();await row(reviseSql,reviseArgs());
 await denied(reviseSql,reviseArgs({expected:id(31)}),'22023');
 await denied('SELECT * FROM uc_signature_file_requests');
 await denied("INSERT INTO uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)VALUES($1,'revision',$2,$3,$4,$5)",[id(33),sig,owner,'a'.repeat(64),id(30)]);
});
it('initial exact replay survives later title edits and does not revert them',async()=>{
 await upload(key(newSig));await row(createSql,createArgs());
 await db.query("UPDATE document_signatures SET document_title='Later legitimate edit' WHERE id=$1",[newSig]);
 expect((await row(createSql,createArgs())).id).toBe(newSig);
 expect((await row('SELECT document_title FROM document_signatures WHERE id=$1',[newSig])).document_title).toBe('Later legitimate edit');
});
it('late receipt failure rolls back initial invitation and revision together',async()=>{
 await upload(key(newSig));await db.exec('RESET ROLE;ALTER TABLE uc_signature_file_requests ADD CONSTRAINT receipt_fail CHECK(false) NOT VALID');
 await as(owner);await denied(createSql,createArgs(),'23514');
 expect(await row('SELECT count(*)::int n FROM document_signatures WHERE id=$1',[newSig])).toEqual({n:0});
 expect(await row('SELECT count(*)::int n FROM signature_revisions WHERE signature_id=$1',[newSig])).toEqual({n:0});
});
it('snapshot sender spoof and pending signed-source/certificate injection deny',async()=>{
 await upload(key(newSig));
 await denied("INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,recipient_type,recipient_email,recipient_name,status,document_snapshot_url)VALUES($1,$2,$3,'external_upload','Forged','student','recipient@example.invalid','Recipient','draft',$4)",[newSig,org,teacher,key(newSig)]);
 for(const patch of ["signed_document_path='fake'","signed_source_path='fake'","certificate_hash='"+'a'.repeat(64)+"'"])
  await denied('UPDATE document_signatures SET '+patch+' WHERE id=$1',[sig]);
});
it('revoked invitation and revoked actor fail both token context and idempotent retry',async()=>{
 await upload();await row(reviseSql,reviseArgs());await db.query('SELECT revoke_signature($1)',[sig]);
 await as(null,'service_role');await denied('SELECT uc_signature_file_context($1)',[token],'55000');
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[owner]);
 await as(owner);await denied(reviseSql,reviseArgs());
});
it('exact signed certificate remains readable without accepting another signature artifact',async()=>{
 await upload();await row(reviseSql,reviseArgs());
 const hash=(await row("SELECT encode(sha256(convert_to('Current HTML','UTF8')),'hex') h")).h;
 await as(null,'service_role');
 await row('SELECT uc_finalize_signature($1,$2,$3,$4,$5,true,NULL,NULL,NULL,NULL,$6,$7,$8)',
  [token,hash,JSON.stringify({agreement_text:'Synthetic acceptance statement',email:'recipient@example.invalid',full_name:'Recipient'}),'pep',id(30),'external-contracts',key(),'a'.repeat(64)]);
 await db.exec('RESET ROLE');
 const certificate=org+'/certificates/'+sig+'.html';
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('signed-documents',$1,'{\"size\":40}')",[certificate]);
 await denied("UPDATE document_signatures SET signed_document_path=$1,certificate_hash=$2,certificate_state='ready' WHERE id=$3",[org+'/certificates/'+otherSig+'.html','b'.repeat(64),sig]);
 await db.query("UPDATE document_signatures SET signed_document_path=$1,certificate_hash=$2,certificate_state='ready' WHERE id=$3",[certificate,'b'.repeat(64),sig]);
 await as(null,'service_role');expect((await context('certificate')).data).toMatchObject({provenance_path:certificate,expected_hash:'b'.repeat(64)});
 await as(teacher);expect(await row("SELECT count(*)::int n FROM storage.objects WHERE bucket_id='signed-documents' AND name=$1",[certificate])).toEqual({n:1});
});
it('scan finalization requires exact signature namespace and recipient uploader, then broker returns sealed proof',async()=>{
 await upload();await row(reviseSql,reviseArgs());
 const scan=org+'/signed-scans/'+sig+'-123.png';
 await as(recipient);await upload(scan,recipient);
 const hash=(await row("SELECT encode(sha256(convert_to('Current HTML','UTF8')),'hex') h")).h;
 await as(null,'service_role');
 await row('SELECT uc_finalize_signature($1,$2,$3,$4,$5,true,NULL,NULL,$6,$7,$8,$9,$10)',
  [token,hash,JSON.stringify({agreement_text:'Synthetic scan acceptance',email:'recipient@example.invalid',full_name:'Recipient'}),'handwritten_scan',id(30),scan,'b'.repeat(64),'external-contracts',key(),'a'.repeat(64)]);
 expect((await context('scan')).data).toMatchObject({provenance_path:scan,expected_hash:'b'.repeat(64)});
});
it('a different uploader scan cannot be sealed, and failure rolls back its agreement',async()=>{
 await upload();await row(reviseSql,reviseArgs());const scan=org+'/signed-scans/'+sig+'-123.png';
 await upload(scan,owner);
 const hash=(await row("SELECT encode(sha256(convert_to('Current HTML','UTF8')),'hex') h")).h;
 await as(null,'service_role');await denied('SELECT uc_finalize_signature($1,$2,$3,$4,$5,true,NULL,NULL,$6,$7,$8,$9,$10)',
  [token,hash,JSON.stringify({agreement_text:'Synthetic scan acceptance',email:'recipient@example.invalid',full_name:'Recipient'}),'handwritten_scan',id(30),scan,'b'.repeat(64),'external-contracts',key(),'a'.repeat(64)]);
 await db.exec('RESET ROLE');expect((await row('SELECT status FROM document_signatures WHERE id=$1',[sig])).status).toBe('in_review');
 expect(await row('SELECT count(*)::int n FROM pep_agreements WHERE organization_id=$1',[org])).toEqual({n:0});
});
