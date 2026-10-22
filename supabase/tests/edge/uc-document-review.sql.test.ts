// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcDocumentReviewFixture,documentReviewMigration} from '../../functions/_shared/uc-document-review.fixture';
import {parseWorkflowEnvelope,workflowCandidatesSchema,workflowSchema,canApproveWorkflow} from '../../../src/lib/orgDocumentWorkflow';
const id=(n:number)=>'a0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),other=id(2),owner=id(3),reviewer=id(4),writer=id(5),reader=id(6),teacher=id(7),student=id(8),viewer=id(9),admin=id(10);
const doc=id(20),foreignDoc=id(21),linkedDoc=id(22),course=id(23),group=id(24),foreignGroup=id(25);
const teacherStaff=id(30),reviewerStaff=id(31);
let db:PGlite,version:string,foreignVersion:string;
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false);SELECT set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const get=async(d=doc)=>(await row('SELECT get_org_document_workflow($1) data',[d])).data;
const saveSql='SELECT save_org_document_review_draft($1,$2,$3,$4,$5,$6,$7,$8) data';
const saveArgs=(o:any={})=>[o.doc??doc,o.version??version,o.docRev??1,o.rev??0,o.responsible??owner,o.reviewer??reviewer,JSON.stringify(o.links??[]),o.request??id(100)];
const save=async(o:any={})=>(await row(saveSql,saveArgs(o))).data;
const transitionSql='SELECT transition_org_document_review($1,$2,$3,$4,$5,$6,$7,$8) data';
const transitionArgs=(w:any,action:string,o:any={})=>[w.id,o.rev??w.revision,o.docRev??1,action,o.note??null,o.number??(action==='approve'?'ВН-2026/1':null),o.date??(action==='approve'?'2026-10-18':null),o.request??id(action==='submit'?101:action==='approve'?102:action==='request_changes'?103:104)];
const transition=async(w:any,action:string,o:any={})=>(await row(transitionSql,transitionArgs(w,action,o))).data;
const commentSql='SELECT add_org_document_review_comment($1,$2,$3,$4,$5,$6,$7) data';
const commentArgs=(w:any,o:any={})=>[w.id,o.version??version,o.rev??w.revision,o.text??'Synthetic comment',o.quote??null,o.anchor?JSON.stringify(o.anchor):null,o.request??id(110)];
const comment=async(w:any,o:any={})=>(await row(commentSql,commentArgs(w,o))).data;
const resolveSql='SELECT resolve_org_document_review_comment($1,$2,$3,$4,$5) data';
const resolveArgs=(w:any,o:any={})=>[o.comment??w.comments[0].id,o.rev??w.revision,o.resolution??'accepted',o.reply??'Recorded decision',o.request??id(120)];
const resolve=async(w:any,o:any={})=>(await row(resolveSql,resolveArgs(w,o))).data;
async function denied(sql:string,args:any[]=[],code='42501'){
 await db.exec('SAVEPOINT rejected');
 try{await db.query(sql,args);throw new Error('Expected denial');}catch(e:any){expect(e.code).toBe(code);}
 finally{await db.exec('ROLLBACK TO rejected');}
}
async function uploadVersion(expected=1,request=id(200)){
 // This fixture has the narrow document policy set, not the general org bucket
 // upload policies. Seed a staged object, then exercise the actual user version RPC.
 await db.exec('RESET ROLE');const path=org+'/versions/'+doc+'/'+request+'.pdf';
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"synthetic-bytes\",\"mimetype\":\"application/pdf\"}')",[path]);
 await as(owner);
 return (await row('SELECT commit_org_document_version($1,$2,$3,$4,$5,NULL,$6) data',[doc,org,request,expected,JSON.stringify({file_path:path,file_name:'Version.pdf',file_size:42,change_summary:'Actual changed file'}),JSON.stringify({status:'active'})])).data;
}
async function inReview(){const w=await save();return transition(w,'submit');}
beforeAll(async()=>{db=await createUcDocumentReviewFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic A'),($2,'Synthetic B')",[org,other]);
 for(const [user,tenant,name] of [[owner,org,'Owner'],[reviewer,org,'Reviewer'],[writer,other,'Multi-org writer'],[reader,org,'Reader'],[teacher,org,'Teacher'],[student,org,'Student']])
  await db.query('INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)',[user,tenant,name]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'admin'),($3,'admin'),($4,'student')",[owner,viewer,admin,student]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'custom','[\"documents.read\",\"documents.write\"]'),($4,$5,$3,'custom','[\"documents.read\",\"documents.write\"]'),($6,$7,$3,'custom','[\"documents.read\"]'),($8,$9,$3,'teacher','[\"documents.read\",\"documents.write\"]')",
  [reviewerStaff,reviewer,org,id(32),writer,id(33),reader,teacherStaff,teacher]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Course')",[course,org]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Assigned'),($4,$5,NULL,'Foreign')",[group,org,course,foreignGroup,other]);
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,teacherStaff,[group]]);
 await db.query("INSERT INTO org_documents(id,organization_id,name,type,status,file_url)VALUES($1,$2,'Source','license','active',NULL),($3,$2,'Related','charter','active','https://fixture.supabase.co/storage/v1/object/public/org-documents/related.pdf')",[doc,org,linkedDoc]);
 version=(await uploadVersion(0,id(190))).version_id;
 await as(admin);await db.query("INSERT INTO org_documents(id,organization_id,name,type,status,file_url)VALUES($1,$2,'Foreign','license','active','https://fixture.supabase.co/foreign.pdf')",[foreignDoc,other]);
 foreignVersion=(await row('SELECT current_version_id FROM org_documents WHERE id=$1',[foreignDoc])).current_version_id;
 await as(owner);
});
afterEach(async()=>db.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());

it('reads absence honestly and does not infer approval from an existing active file',async()=>{
 const e=await get();expect(e.workflow).toBeNull();expect(e.cycles).toEqual([]);expect(e.revision).toBe(0);
 expect(e.document.current_version_id).toBe(version);expect(e.capabilities).toMatchObject({can_configure:true,can_decide:false,can_submit:false});
 expect(await row('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:0});
});
it('candidate selector exposes real active owner/staff only and exact tenant links',async()=>{
 const c=(await row('SELECT list_org_document_review_candidates($1) data',[doc])).data;
 expect(workflowCandidatesSchema.parse(c)).toEqual(c);
 expect(c.actors.map((a:any)=>a.user_id).sort()).toEqual([owner,reviewer,writer].sort());
 expect(c.actors.find((a:any)=>a.user_id===owner)).toMatchObject({kind:'owner',staff_id:null});
 expect(c.groups.map((g:any)=>g.id)).toEqual([group]);expect(c.related_documents.map((d:any)=>d.id)).toEqual([linkedDoc]);
 expect(Object.keys(c).sort()).toEqual(['actors','courses','groups','related_documents'].sort());
});
it('configures a real version-bound cycle and replays exact original request after later changes',async()=>{
 const w=await save({links:[{kind:'course',id:course,version_id:null},{kind:'group',id:group,version_id:null}]});
 expect(w).toMatchObject({document_id:doc,version_id:version,state:'draft',revision:1,responsible_user_id:owner,reviewer_user_id:reviewer,responsible_name:'Owner',reviewer_name:'Reviewer',approval:null});
 expect(workflowSchema.parse(w)).toEqual(w);
 const later=await save({rev:1,request:id(105),reviewer:writer});
 expect(later.revision).toBe(2);
 expect(await save({links:[{kind:'course',id:course,version_id:null},{kind:'group',id:group,version_id:null}]})).toEqual(w);
 expect((await get()).workflow.reviewer_user_id).toBe(writer);
});
it('lost response cannot reuse request UUID with changed actor, assignments or expected revision',async()=>{
 await save();await denied(saveSql,saveArgs({reviewer:writer}),'22023');await denied(saveSql,saveArgs({rev:1}),'22023');
 await as(writer);await denied(saveSql,saveArgs(),'22023');
});
it('participant names are review snapshots and remain readable without directory write access',async()=>{
 const w=await save();await db.exec('RESET ROLE');
 await db.query('UPDATE profiles SET full_name=$1 WHERE user_id=$2',['Changed later',reviewer]);
 await as(reader);await denied('SELECT list_org_document_review_candidates($1)',[doc]);
 const e=parseWorkflowEnvelope(await get(),doc,org);expect(e.workflow?.reviewer_name).toBe('Reviewer');
 await as(owner);const next=await save({rev:1,request:id(135)});expect(next.reviewer_name).toBe('Changed later');
 expect(await save()).toEqual(w);
 await db.exec('RESET ROLE');const first=await row('SELECT snapshot FROM org_document_review_events WHERE review_id=$1 AND revision=1',[w.id]);
 expect(first.snapshot.reviewer_name).toBe('Reviewer');
});
it.each([reader,teacher,student,viewer])('denies configuration by %s without widening through group links',async(user)=>{
 await as(user);await denied(saveSql,saveArgs({links:[{kind:'group',id:group,version_id:null}]}));
 await denied('SELECT list_org_document_review_candidates($1)',[doc]);
 if([reader,viewer].includes(user))expect((await get()).workflow).toBeNull();
 else await denied('SELECT get_org_document_workflow($1)',[doc]);
});
it('denies anonymous and service-only RPCs and private dispatcher/receipts',async()=>{
 await as(null,'anon');await denied('SELECT get_org_document_workflow($1)',[doc]);
 await as(null,'service_role');await denied(saveSql,saveArgs());
 await as(owner);await denied("SELECT uc_mutate_org_document_review('save',$1)",[JSON.stringify({})]);
 await denied('SELECT * FROM org_document_review_requests');
});
it('multi-organization writer can configure authorized organization but cannot claim foreign scope',async()=>{
 await as(writer);expect((await save()).organization_id).toBe(org);await denied('SELECT get_org_document_workflow($1)',[foreignDoc]);
 await denied(saveSql,saveArgs({doc:foreignDoc,version:foreignVersion,request:id(106)}));
});
it.each([teacher,reader,student,viewer,admin,id(999)])('rejects ineligible assignee %s without role backfill',async(user)=>{
 await denied(saveSql,saveArgs({reviewer:user}));
});
it('revoked/expired assignees are excluded and cannot act after assignment',async()=>{
 let w=await inReview();await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET expires_at=now()-interval '1 second' WHERE user_id=$1",[reviewer]);
 await as(reviewer);await denied(transitionSql,transitionArgs(w,'approve'));
 await as(owner);await denied(saveSql,saveArgs({request:id(130),reviewer}),'40001');
 const candidates=(await row('SELECT list_org_document_review_candidates($1) d',[doc])).d;
 expect(candidates.actors.some((a:any)=>a.user_id===reviewer)).toBe(false);
});
it('receipt replay still requires current active actor permission after revocation',async()=>{
 const w=await inReview();await as(reviewer);await comment(w);
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[reviewer]);
 await as(reviewer);await denied(commentSql,commentArgs(w));await denied('SELECT get_org_document_workflow($1)',[doc]);
 await as(owner);expect((await get()).workflow.comments).toHaveLength(1);
});
it('rejects foreign version and linked document/group/course/version identifiers',async()=>{
 await denied(saveSql,saveArgs({version:foreignVersion}),'40001');
 for(const link of [{kind:'group',id:foreignGroup,version_id:null},{kind:'document',id:foreignDoc,version_id:null},{kind:'course',id:id(999),version_id:null},{kind:'document',id:linkedDoc,version_id:foreignVersion}])
  await denied(saveSql,saveArgs({links:[link]}));
});
it('rejects unsupported, duplicate and malformed links rather than silently dropping them',async()=>{
 for(const links of [[{kind:'program_document',id:doc,version_id:null}],[{kind:'group',id:group,version_id:null,scope:'all'}],[{kind:'group',id:group}], [{kind:'group',id:group,version_id:null},{kind:'group',id:group,version_id:null}]])
  await denied(saveSql,saveArgs({links}),'22023');
});
it('rechecks linked tenant ownership at submit and approval instead of trusting old link snapshots',async()=>{
 const w=await save({links:[{kind:'course',id:course,version_id:null}]});
 await db.exec('RESET ROLE');await db.query('UPDATE courses SET organization_id=$1 WHERE id=$2',[other,course]);
 await as(owner);await denied(transitionSql,transitionArgs(w,'submit'));
 await db.exec('RESET ROLE');await db.query('UPDATE courses SET organization_id=$1 WHERE id=$2',[org,course]);
 await as(owner);const active=await transition(w,'submit');
 await db.exec('RESET ROLE');await db.query('UPDATE courses SET organization_id=$1 WHERE id=$2',[other,course]);
 await as(reviewer);await denied(transitionSql,transitionArgs(active,'approve'));
});
it('only responsible submits and reviewer approves; unassigned owner/writer does not impersonate reviewer',async()=>{
 const w=await save();await as(reviewer);await denied(transitionSql,transitionArgs(w,'submit'));
 await as(owner);const active=await transition(w,'submit');await denied(transitionSql,transitionArgs(active,'approve'));
 await as(writer);await denied(transitionSql,transitionArgs(active,'approve'));
 await as(reviewer);const approved=await transition(active,'approve');
 expect(approved.approval).toMatchObject({number:'ВН-2026/1',date:'2026-10-18',recorded_by:reviewer});
 expect(approved.state).toBe('approved');expect(approved.approval.recorded_at).toBeTypeOf('string');
});
it('approval is exact-retry idempotent and never becomes an external signature or document number',async()=>{
 const before=await row('SELECT (SELECT count(*) FROM document_signatures)::int signatures,(SELECT count(*) FROM pep_agreements)::int pep,(SELECT sum(last_number) FROM document_number_sequences)::int numbers');
 const w=await inReview();await as(reviewer);const result=await transition(w,'approve');expect(await transition(w,'approve')).toEqual(result);
 const after=await row('SELECT (SELECT count(*) FROM document_signatures)::int signatures,(SELECT count(*) FROM pep_agreements)::int pep,(SELECT sum(last_number) FROM document_number_sequences)::int numbers');expect(after).toEqual(before);
 expect((await get()).workflow.events.map((e:any)=>e.action)).toEqual(['configure','submit','approve']);
});
it('missing approval number/date and approval metadata on other actions are rejected',async()=>{
 const w=await inReview();await as(reviewer);
 const blank=transitionArgs(w,'approve');blank[5]='\t \n';await denied(transitionSql,blank,'22023');
 const noDate=transitionArgs(w,'approve');noDate[6]=null;await denied(transitionSql,noDate,'22023');
 await denied(transitionSql,transitionArgs(w,'request_changes',{number:'unearned'}),'22023');
});
it('comment identity/time/version is authoritative and unresolved comment blocks approval',async()=>{
 let w=await inReview();await as(reviewer);w=await comment(w,{quote:'Exact quoted text',anchor:{kind:'comment',startOffset:0,endOffset:4}});
 expect(w.comments[0]).toMatchObject({author_user_id:reviewer,author_name:'Reviewer',author_role:'reviewer',resolved:false,resolution_status:'unresolved'});
 const e=parseWorkflowEnvelope(await get(),doc,org);expect(e.capabilities.can_decide).toBe(true);expect(canApproveWorkflow(e)).toBe(false);
 await denied(transitionSql,transitionArgs(w,'approve'),'55000');
 const resolved=await resolve(w,{resolution:'declined'});expect(resolved.comments[0]).toMatchObject({resolved:true,resolution_status:'declined',org_reply:'Recorded decision'});
 expect(canApproveWorkflow(parseWorkflowEnvelope(await get(),doc,org))).toBe(true);
 expect((await transition(resolved,'approve')).state).toBe('approved');
 expect(parseWorkflowEnvelope(await get(),doc,org).workflow?.approval?.recorded_by).toBe(reviewer);
});
it('responsible may comment but only designated reviewer resolves',async()=>{
 let w=await inReview();w=await comment(w);await denied(resolveSql,resolveArgs(w));
 await as(writer);await denied(commentSql,commentArgs(w));
});
it('reviewer can resolve comments during requested changes while approval remains in-review only',async()=>{
 let w=await inReview();await as(reviewer);w=await comment(w);w=await transition(w,'request_changes');
 let e=parseWorkflowEnvelope(await get(),doc,org);expect(e.capabilities.can_decide).toBe(true);expect(canApproveWorkflow(e)).toBe(false);
 w=await resolve(w);expect(w.comments[0].resolved).toBe(true);await denied(transitionSql,transitionArgs(w,'approve'));
 await as(owner);w=await transition(w,'submit',{request:id(136)});await as(reviewer);
 e=parseWorkflowEnvelope(await get(),doc,org);expect(canApproveWorkflow(e)).toBe(true);
 expect((await transition(w,'approve')).state).toBe('approved');
});
it('comments do not silently transfer to another file version or rewrite original text',async()=>{
 let w=await inReview();await as(reviewer);await denied(commentSql,commentArgs(w,{version:foreignVersion}),'40001');
 w=await comment(w);
 await db.exec('RESET ROLE');await denied('UPDATE org_document_review_comments SET comment_text=$1 WHERE id=$2',['Forged replacement',w.comments[0].id]);
});
it.each(['insert','delete','replace'])('accepted %s proposal requires actual new bytes/version and a new cycle',async(kind)=>{
 let w=await inReview();await as(reviewer);w=await comment(w,{anchor:{kind,replacement:'Proposal only'},quote:'Old text'});
 w=await resolve(w);expect(w.requires_new_version).toBe(true);await denied(transitionSql,transitionArgs(w,'approve'),'55000');
 w=await transition(w,'request_changes');await as(owner);await denied(transitionSql,transitionArgs(w,'submit',{request:id(150)}),'55000');
 const next=await uploadVersion();const e=await get();expect(e.workflow).toBeNull();expect(e.revision).toBe(0);expect(e.cycles[0].comments[0].resolution_status).toBe('accepted');
 expect(parseWorkflowEnvelope(e,doc,org).cycles[0].requires_new_version).toBe(true);
 const fresh=await save({version:next.version_id,docRev:2,request:id(151)});expect(fresh.comments).toEqual([]);expect(fresh.requires_new_version).toBe(false);
});
it('stale approval after upload fails; older approval never applies to replacement or restore',async()=>{
 const w=await inReview();const next=await uploadVersion();
 await as(reviewer);await denied(transitionSql,transitionArgs(w,'approve'),'40001');
 await as(owner);expect((await get()).workflow).toBeNull();
 let fresh=await save({version:next.version_id,docRev:2,request:id(152)});fresh=await transition(fresh,'submit',{docRev:2,request:id(153)});
 await as(reviewer);await transition(fresh,'approve',{docRev:2,request:id(154)});
 await as(owner);await row('SELECT commit_org_document_version($1,$2,$3,2,NULL,$4,$5)',[doc,org,id(201),version,JSON.stringify({status:'active'})]);
 const e=await get();expect(e.workflow).toBeNull();expect(e.cycles.some((c:any)=>c.state==='approved'&&c.version_id===next.version_id)).toBe(true);
});
it('workflow CAS rejects stale comments, resolutions and draft edits without duplicate history',async()=>{
 let w=await save();await denied(saveSql,saveArgs({request:id(140)}),'40001');w=await transition(w,'submit');
 await as(reviewer);const updated=await comment(w);await denied(commentSql,commentArgs(w,{request:id(141)}),'40001');
 await denied(resolveSql,resolveArgs(updated,{rev:w.revision}),'40001');
 expect((await get()).workflow.comments).toHaveLength(1);
});
it('closed approval cannot be edited, cancelled, commented on, or erased',async()=>{
 let w=await inReview();await as(reviewer);w=await transition(w,'approve');
 await denied(commentSql,commentArgs(w,{request:id(160)}),'55000');
 await denied(transitionSql,transitionArgs(w,'cancel'),'55000');
 await as(owner);await denied(saveSql,saveArgs({rev:w.revision,request:id(161)}),'55000');
 await db.exec('RESET ROLE');await denied('UPDATE org_document_reviews SET approval_number=$1 WHERE id=$2',['forged',w.id]);
 await denied('DELETE FROM org_document_review_events WHERE review_id=$1',[w.id]);
 await denied('DELETE FROM org_document_review_requests WHERE review_id=$1',[w.id]);
});
it('cancellation has immutable exact-version history and does not invent approval',async()=>{
 let w=await inReview();await as(owner);w=await transition(w,'cancel');
 expect(w.state).toBe('cancelled');expect(w.approval).toBeNull();
 await denied(saveSql,saveArgs({rev:w.revision,request:id(162)}),'55000');
 const e=parseWorkflowEnvelope(await get(),doc,org);expect(e.cycles[0].events.at(-1)?.action).toBe('cancel');
 expect(Object.values(e.capabilities).every(v=>v===false)).toBe(true);
});
it.each(['archived','expired'])('%s current document retains readable history but cannot advance review',async(status)=>{
 const w=await inReview();await db.query('UPDATE org_documents SET status=$1 WHERE id=$2',[status,doc]);
 const e=await get();expect(e.document.file_state).toBe(status);expect(e.cycles).toHaveLength(1);expect(Object.values(e.capabilities).every(v=>v===false)).toBe(true);
 await as(reviewer);await denied(transitionSql,transitionArgs(w,'approve'),'55000');
});
it('deleted document and elapsed expiry retain history without current-ready capability',async()=>{
 const w=await inReview();await db.query("UPDATE org_documents SET expires_at=current_date-1 WHERE id=$1",[doc]);expect((await get()).document.file_state).toBe('expired');
 await db.query('UPDATE org_documents SET deleted_at=now() WHERE id=$1',[doc]);expect((await get()).document.file_state).toBe('deleted');
 await as(reviewer);await denied(transitionSql,transitionArgs(w,'approve'),'55000');
});
it('fileless record does not create an invented version or review history',async()=>{
 await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Fileless','license','active')",[id(222),org]);
 await denied(saveSql,saveArgs({doc:id(222),version:id(999),docRev:0}),'55000');
 const e=await get(id(222));expect(e.workflow).toBeNull();expect(e.document.file_state).toBe('fileless');expect(e.document.current_version_id).toBeNull();
});
it('historical URL without object-bound immutable version remains readable but cannot be approved',async()=>{
 const e=parseWorkflowEnvelope(await get(linkedDoc),linkedDoc,org);
 expect(e.document.file_state).toBe('unconfirmed');expect(e.document.file_url).toContain('related.pdf');
 expect(Object.values(e.capabilities).every(v=>v===false)).toBe(true);
 await denied(saveSql,saveArgs({doc:linkedDoc,version:e.document.current_version_id}),'55000');
});
it.each(['size','etag','mimetype','invalid-size','missing-object','wrong-object-path'])('fails closed on %s drift of bound Storage metadata while retaining existing review history',async(kind)=>{
 const w=await inReview();await db.exec('RESET ROLE');
 const path=org+'/versions/'+doc+'/'+id(190)+'.pdf';
 if(kind==='missing-object')await db.query("DELETE FROM storage.objects WHERE bucket_id='org-documents' AND name=$1",[path]);
 else if(kind==='wrong-object-path')await db.query("UPDATE storage.objects SET name=$2 WHERE bucket_id='org-documents' AND name=$1",[path,other+'/versions/'+doc+'/'+id(190)+'.pdf']);
 else await db.query("UPDATE storage.objects SET metadata=metadata||$2::jsonb WHERE bucket_id='org-documents' AND name=$1",[path,JSON.stringify(kind==='size'?{size:43}:kind==='etag'?{etag:'different'}:kind==='mimetype'?{mimetype:'text/html'}:{size:'not-a-size'})]);
 await as(reviewer);const e=parseWorkflowEnvelope(await get(),doc,org);
 expect(e.document.file_state).toBe('unconfirmed');expect(e.workflow?.version_id).toBe(version);expect(e.cycles).toHaveLength(1);
 expect(Object.values(e.capabilities).every(v=>v===false)).toBe(true);
 await denied(transitionSql,transitionArgs(w,'approve'),'55000');
});
it('existing102 restrictive policies prevent owner overwrite/delete even with an unrelated permissive Storage grant',async()=>{
 await db.exec('RESET ROLE;CREATE POLICY synthetic_storage_broad ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true)');
 await as(owner);const path=org+'/versions/'+doc+'/'+id(190)+'.pdf';
 expect((await db.query("UPDATE storage.objects SET metadata='{\"size\":999}' WHERE bucket_id='org-documents' AND name=$1 RETURNING id",[path])).rows).toEqual([]);
 expect((await db.query("DELETE FROM storage.objects WHERE bucket_id='org-documents' AND name=$1 RETURNING id",[path])).rows).toEqual([]);
 expect((await get()).document.file_state).toBe('active');
 const staging=org+'/versions/'+doc+'/'+id(299)+'.pdf';
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42}')",[staging]);
 expect((await db.query("DELETE FROM storage.objects WHERE bucket_id='org-documents' AND name=$1 RETURNING id",[staging])).rows).toEqual([]);
});
it('late event failure rolls back workflow update and comment; no fabricated receipt',async()=>{
 const w=await inReview();await db.exec('RESET ROLE;ALTER TABLE org_document_review_events ADD CONSTRAINT synthetic_fail CHECK(false) NOT VALID');
 await as(reviewer);await denied(commentSql,commentArgs(w),'23514');
 const e=await get();expect(e.workflow.revision).toBe(w.revision);expect(e.workflow.comments).toEqual([]);
});
it('late receipt failure rolls back the entire initial review and its event',async()=>{
 await db.exec('RESET ROLE;ALTER TABLE org_document_review_requests ADD CONSTRAINT synthetic_fail CHECK(false) NOT VALID');
 await as(owner);await denied(saveSql,saveArgs(),'23514');
 expect((await get()).workflow).toBeNull();expect(await row('SELECT count(*)::int n FROM org_document_review_events')).toEqual({n:0});
});
it('new permissive SELECT cannot override exact tenant/revoked restrictive boundaries',async()=>{
 await save();await db.exec('RESET ROLE;CREATE POLICY synthetic_broad ON org_document_reviews FOR SELECT TO authenticated USING(true)');
 await as(student);expect(await row('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:0});
 await as(reader);expect(await row('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:1});
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[reader]);
 await as(reader);expect(await row('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:0});
});
it('direct DML remains forbidden for authenticated and service-only actors',async()=>{
 const w=await save();await denied('UPDATE org_document_reviews SET revision=100 WHERE id=$1',[w.id]);
 await as(null,'service_role');await denied('UPDATE org_document_reviews SET revision=100 WHERE id=$1',[w.id]);
});
it('rejects source dependency drift before creating new tables',async()=>{
 await db.exec('RESET ROLE;SAVEPOINT drift;CREATE OR REPLACE FUNCTION uc_guard_document_pointer() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$');
 await expect(db.exec(documentReviewMigration)).rejects.toThrow(/unreviewed document\/access baseline/);await db.exec('ROLLBACK TO drift');
});
it('fails closed if the existing immutable Storage policy is removed',async()=>{
 await db.exec('RESET ROLE;SAVEPOINT drift;DROP POLICY uc_org_document_blob_no_delete ON storage.objects');
 await expect(db.exec(documentReviewMigration)).rejects.toThrow(/unreviewed immutable Storage boundary/);await db.exec('ROLLBACK TO drift');
});
