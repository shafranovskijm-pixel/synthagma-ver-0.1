// @vitest-environment node
import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcIdentificationFixture,identificationBaseline} from '../../functions/_shared/uc-identification-private-review.fixture';
const id=(n:number)=>'e0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const org=id(1),foreign=id(2),owner=id(3),student=id(4),student2=id(5),reader=id(6),writer=id(7),teacher=id(8),expired=id(9),viewer=id(10),sales=id(11),revoked=id(12),outside=id(13),oneRight=id(14),staff=id(15),course=id(20),course2=id(21),group=id(22),group2=id(23),enrollment=id(30),enrollment2=id(31),legacy=id(40);
let db:PGlite;
const one=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const as=async(user:string|null,role='authenticated')=>db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','"+(user??'')+"',false),set_config('request.jwt.claim.role','"+role+"',false);SET ROLE "+role);
async function denied(sql:string,args:any[]=[],code='42501'){
 await db.exec('SAVEPOINT denied');try{await db.query(sql,args);throw new Error('Expected denial');}catch(e:any){if(e.code!==code)throw e;expect(e.code).toBe(code);}finally{await db.exec('ROLLBACK TO denied');}
}
beforeAll(async()=>{db=await createUcIdentificationFixture();},30000);
beforeEach(async()=>{
 await db.exec("RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Synthetic identity A'),($2,'Synthetic identity B')",[org,foreign]);
 for(const u of [owner,student,student2,reader,writer,teacher,expired,viewer,sales,revoked,oneRight])await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic identity learner')",[u,org]);
 await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic foreign')",[outside,foreign]);
 await db.query("INSERT INTO user_roles VALUES($1,'organization'),($2,'student'),($3,'student'),($4,'student'),($5,'admin'),($6,'sales_manager')",[owner,student,student2,outside,viewer,sales]);
 await db.query("INSERT INTO admin_staff(user_id,role)VALUES($1,'viewer')",[viewer]);
 for(const[u,permissions]of [[reader,['students.read','documents.read']],[writer,['students.write','documents.write','courses.write']],[oneRight,['students.write']],[expired,['students.write','documents.write']],[revoked,['students.write','documents.write']]] as const)await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom',$3)",[u,org,[...permissions]]);
 await db.query("UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id=$1",[expired]);await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[revoked]);
 await db.query("INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES($1,$2,$3,'teacher','[\"students.read\",\"documents.read\",\"students.write\",\"documents.write\"]')",[staff,teacher,org]);
 await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Identity course A'),($3,$2,'Identity course B')",[course,org,course2]);
 await db.query("INSERT INTO student_groups(id,organization_id,course_id,name)VALUES($1,$2,$3,'Identity group A'),($4,$2,$5,'Identity group B')",[group,org,course,group2,course2]);
 await db.query('INSERT INTO student_group_memberships(organization_id,group_id,user_id)VALUES($1,$2,$3),($1,$4,$3),($1,$4,$5)',[org,group,student,group2,student2]);
 await db.query("INSERT INTO enrollments(id,user_id,course_id,status,progress,time_spent)VALUES($1,$2,$3,'active',0,0),($4,$5,$6,'active',0,0)",[enrollment,student,course,enrollment2,student2,course2]);
 // Synthetic historic row is seeded by fixture owner only, before user checks.
 await db.exec('ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard');
 await db.query("INSERT INTO video_identifications(id,user_id,organization_id,status,photo_url,verified_by,verified_at)VALUES($1,$2,$3,'verified','https://invalid.example/legacy.jpg',$4,now())",[legacy,student,org,owner]);
 await db.exec('ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard');
 await as(owner);await db.query('SELECT set_org_staff_document_groups($1,$2,$3,0)',[org,staff,[group]]);
});
afterEach(async()=>db?.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());
async function prepare(enroll:string|null=enrollment,user=student,request=id(50)){
 await as(user);return(await one('SELECT prepare_own_identification_photo($1,$2,$3) value',[org,request,enroll])).value;
}
async function upload(p:any,size=7,mime='image/jpeg'){
 await as(null,'service_role');await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,$2,$3,$4,$5)",[id(60),p.bucket,p.path,student,JSON.stringify({mimetype:mime,size})]);
}
async function submit(p:any,request=id(51)){
 await as(student);const c=(await one('SELECT uc_identification_submit_context($1,$2,$3,$4)value',[p.identificationId,p.sourceId,p.revision,request])).value;
 await as(null,'service_role');return(await one('SELECT uc_commit_identification_photo($1,$2,$3,$4,$5,$6,$7,$8,$9)value',[student,p.identificationId,p.sourceId,p.revision,request,c.storageObjectId,c.objectUpdatedAt,'a'.repeat(64),c.byteSize])).value;
}
const decision=async(action:string,pid:string|null,revision:number,request=id(52),user=writer,reason:string|null=null)=>{
 await as(user);return(await one('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)value',[org,student,request,action,pid,revision,reason])).value;
};
it('installs exactly private prospective state and fresh captured applied112/113 originals',async()=>{
 await db.exec('RESET ROLE');
 expect((await one("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'uc_identification_%'")).n).toBe(5);
 expect((await one('SELECT count(*)::int n FROM uc_identification_records')).n).toBe(0);
});
it('self prepares exact create-only private source without a projection, approval or avatar mutation',async()=>{
 const p=await prepare();expect(p).toMatchObject({contractVersion:1,replayed:false,revision:1,bucket:'student-identification-media',mimeType:'image/jpeg',maxBytes:5242880});
 expect(p.path).toBe(`${student}/${org}/${p.identificationId}/${p.sourceId}/capture.jpg`);
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM video_identifications WHERE id=$1',[p.identificationId])).n).toBe(0);
 expect((await one('SELECT count(*)::int n FROM uc_identification_events')).n).toBe(0);
});
it('preparation replay is identical and cannot retarget its request or extend its expiry',async()=>{
 const p=await prepare();const replay=await prepare();expect(replay).toEqual({...p,replayed:true});
 await denied('SELECT prepare_own_identification_photo($1,$2,$3)',[org,id(50),null],'40001');
});
it.each([outside,viewer,sales,revoked])('cannot prepare another subject or privileged readonly own capture actor %s',async(user)=>{
 await as(user);await denied('SELECT prepare_own_identification_photo($1,$2,$3)',[org,id(50),enrollment]);
});
it('submits only pending revision2 with actual byte witness and exact immutable replay event',async()=>{
 const p=await prepare();await upload(p);const result=await submit(p);
 expect(result).toMatchObject({replayed:false,record:{identificationId:p.identificationId,revision:2,status:'pending',sourceKind:'self_photo',assurance:'submitted'},event:{action:'submitted',revision:2,reviewerUserId:null}});
 await as(student);const c=(await one('SELECT uc_identification_submit_context($1,$2,$3,$4)value',[p.identificationId,p.sourceId,1,id(51)])).value;
 expect(c).toMatchObject({mode:'committed',revision:2,byteSha256:'a'.repeat(64),replayResult:{...result,replayed:true}});
 expect((await submit(p))).toEqual({...result,replayed:true});
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM uc_identification_events')).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_write_contexts')).n).toBe(0);
});
it.each([[0,'image/jpeg'],[5242881,'image/jpeg'],[7,'text/html']])('invalid object metadata size %s mime %s never commits',async(size,mime)=>{
 const p=await prepare();await upload(p,size as number,mime as string);await as(student);
 await denied('SELECT uc_identification_submit_context($1,$2,$3,$4)',[p.identificationId,p.sourceId,1,id(51)],'P0001');
});
it('expired reservation and absent object fail honestly; replay does not extend the reservation',async()=>{
 const p=await prepare();await as(student);await denied('SELECT uc_identification_submit_context($1,$2,$3,$4)',[p.identificationId,p.sourceId,1,id(51)],'P0001');
 await db.exec('RESET ROLE');await db.query("UPDATE uc_identification_sources SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[p.sourceId]);await as(student);
 await denied('SELECT uc_identification_submit_context($1,$2,$3,$4)',[p.identificationId,p.sourceId,1,id(51)],'P0001');
});
it('current reviewer verifies one exact submitted photo with actual actor/server time and CAS',async()=>{
 const p=await prepare();await upload(p);await submit(p);const result=await decision('verify',p.identificationId,2);
 expect(result).toMatchObject({record:{status:'verified',revision:3,assurance:'current_server_review'},event:{action:'verified',reviewerUserId:writer}});
 expect(result.record.decidedAt).toBeTruthy();await db.exec('RESET ROLE');expect(await one('SELECT verified_by,status FROM video_identifications WHERE id=$1',[p.identificationId])).toEqual({verified_by:writer,status:'verified'});
 await as(writer);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(53),'reset',p.identificationId,2,null],'40001');
});
it.each([student,student2,reader,oneRight,expired,viewer,sales,revoked,outside])('manual decision denied for unauthorized original actor %s',async(user)=>{
 await as(user);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(52),'manual_verify',null,0,null]);
});
it('assigned teacher may review exact bound enrollment but not another course of the same subject',async()=>{
 const p=await prepare();await upload(p);await submit(p);expect((await decision('verify',p.identificationId,2,id(52),teacher)).record.status).toBe('verified');
 await db.exec('RESET ROLE');await db.query('UPDATE enrollments SET user_id=$1 WHERE id=$2',[student,enrollment2]);
 const p2=await prepare(enrollment2,student,id(55));await as(null,'service_role');await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,$2,$3,$4,$5)",[id(61),p2.bucket,p2.path,student,JSON.stringify({mimetype:'image/jpeg',size:7})]);await submit(p2,id(56));
 await as(teacher);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(57),'verify',p2.identificationId,2,null]);
});
it('manual create is explicit no-photo provenance and reset appends history without changing enrollment',async()=>{
 const v=await decision('manual_verify',null,0);expect(v.record).toMatchObject({status:'verified',revision:1,sourceKind:'manual_staff_claim',media:null,submittedAt:null});
 expect((await decision('reset',v.record.identificationId,1,id(53))).record).toMatchObject({status:'pending',revision:2,assurance:'unreviewed',decidedAt:null,media:null});
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM uc_identification_events')).n).toBe(2);expect((await one('SELECT status FROM enrollments WHERE id=$1',[enrollment])).status).toBe('active');
});
it('legacy reset is an exact overlay, preserves original row and historical compatibility, and never trusts old photo',async()=>{
 await db.exec('RESET ROLE');const before=(await one('SELECT to_jsonb(v) row FROM video_identifications v WHERE id=$1',[legacy])).row;
 const result=await decision('reset',legacy,0);expect(result.record).toMatchObject({identificationId:legacy,revision:1,status:'pending',sourceKind:'legacy_unclassified',assurance:'historical_unproven',media:null});
 await db.exec('RESET ROLE');expect((await one('SELECT to_jsonb(v) row FROM video_identifications v WHERE id=$1',[legacy])).row).toEqual(before);
 await as(student);const state=(await one('SELECT get_student_identification_state($1,$2,true,NULL)value',[org,[student]])).value.subjects[0];expect(state.compatibility.historicalVerifiedObserved).toBe(true);expect(state.current.revision).toBe(1);expect(state.history).toHaveLength(1);
 await as(writer);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(53),'verify',legacy,1,null],'P0001');
});
it('legacy pending rejection does not rewrite the old status or forge an image witness',async()=>{
 await db.exec('RESET ROLE;ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard');await db.query("UPDATE video_identifications SET status='pending',verified_by=NULL,verified_at=NULL WHERE id=$1",[legacy]);await db.exec('ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard');
 const result=await decision('reject',legacy,0,id(52),writer,'Нужен новый снимок');expect(result.record.status).toBe('rejected');
 await db.exec('RESET ROLE');expect((await one('SELECT status FROM video_identifications WHERE id=$1',[legacy])).status).toBe('pending');expect((await one('SELECT count(*)::int n FROM uc_identification_sources')).n).toBe(0);
});
it('source verified and reset history stays immutable through exact receipt replay and actor/body collisions',async()=>{
 const p=await prepare();await upload(p);const initial=await submit(p);const v=await decision('verify',p.identificationId,2);const replay=await decision('verify',p.identificationId,2);expect(replay.record).toEqual(v.record);expect(replay.replayed).toBe(true);
 await as(writer);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(52),'reset',p.identificationId,3,null],'40001');
 await decision('reset',p.identificationId,3,id(53));await as(student);const c=(await one('SELECT uc_identification_submit_context($1,$2,1,$3)value',[p.identificationId,p.sourceId,id(51)])).value;
 expect(c.revision).toBe(4);expect(c.replayResult.record.revision).toBe(2);expect(c.replayResult.event.eventId).toBe(initial.event.eventId);
});
it.each(['INSERT','UPDATE','DELETE'])('ordinary direct video %s cannot forge status or edit history',async(op)=>{
 await as(student);
 if(op==='INSERT')await denied("INSERT INTO video_identifications(user_id,organization_id,status,verified_by,verified_at)VALUES($1,$2,'verified',$1,now())",[student,org]);
 else expect((await db.query(op==='UPDATE'?"UPDATE video_identifications SET status='verified',verified_by=$1 WHERE id=$2 RETURNING id":"DELETE FROM video_identifications WHERE user_id=$1 AND id=$2 RETURNING id",[student,legacy])).rows).toHaveLength(0);
});
it('generic service DML or forged client GUC never replaces a private transaction witness',async()=>{
 await as(null,'service_role');await db.query("SELECT set_config('sintagma.identification_review','true',true)");
 await denied("INSERT INTO video_identifications(user_id,organization_id,status)VALUES($1,$2,'verified')",[student,org]);
 await denied('SELECT uc_registration_identification_claim($1,$2,$3)',[org,student,writer]);
});
it('single/bounded read is tenant-safe, omits raw URLs and distinguishes confirmed absence',async()=>{
 await as(reader);const s=(await one('SELECT get_student_identification_state($1,$2,false,NULL)value',[org,[student,student2]])).value.subjects;
 expect(s).toHaveLength(2);expect(s[0].current).toMatchObject({assurance:'historical_unproven',revision:0,media:null});expect(JSON.stringify(s)).not.toContain('invalid.example');expect(s[1].current).toBe(null);expect(s[1].history).toEqual([]);
 await denied('SELECT get_student_identification_state($1,$2,false,NULL)',[org,[student,outside]]);await denied('SELECT get_student_identification_state($1,$2,false,NULL)',[org,[student,id(999)]]);
 await as(student);await denied('SELECT get_student_identification_state($1,$2,false,NULL)',[org,[student,student2]]);
});
it.each([{ids:[]},{ids:[student,student]},{ids:Array.from({length:101},(_,i)=>id(1000+i))}])('rejects malformed bounded read batch $ids',async({ids})=>{
 await as(reader);await denied('SELECT get_student_identification_state($1,$2,false,NULL)',[org,ids],'22023');
});
it('archived nonrevoked history remains readable but new review/self upload is closed',async()=>{
 await db.exec('RESET ROLE');await db.query('UPDATE profiles SET archived_at=now() WHERE user_id=$1',[student]);await as(reader);
 expect((await one('SELECT get_student_identification_state($1,$2,true,NULL)value',[org,[student]])).value.subjects[0].current.identificationId).toBe(legacy);
 await as(writer);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(52),'manual_verify',null,0,null]);
 await as(student);await denied('SELECT prepare_own_identification_photo($1,$2,NULL)',[org,id(50)]);
});
it('protected media uses exact current source scope and detects object replacement',async()=>{
 const p=await prepare();await upload(p);await submit(p);await as(reader);const c=(await one('SELECT uc_identification_media_context($1,$2)value',[p.identificationId,p.sourceId])).value;expect(c).toMatchObject({actorId:reader,studentUserId:student,byteSize:7,byteSha256:'a'.repeat(64)});
 await as(outside);await denied('SELECT uc_identification_media_context($1,$2)',[p.identificationId,p.sourceId]);
 await db.exec('RESET ROLE');await db.query("UPDATE storage.objects SET updated_at=updated_at+interval '1 second' WHERE id=$1",[id(60)]);await as(student);await denied('SELECT uc_identification_media_context($1,$2)',[p.identificationId,p.sourceId],'P0001');
});
it('private reservation storage denies traversal/foreign/raw SDK overwrite or deletion',async()=>{
 const p=await prepare();await as(student);
 expect((await one('SELECT uc_identification_storage_allowed($1,$2,true) allowed',[p.bucket,p.path])).allowed).toBe(true);
 expect((await one('SELECT uc_identification_storage_allowed($1,$2,true) allowed',[p.bucket,p.path+'/../x'])).allowed).toBe(false);
 await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,$2,$3,$4,$5)",[id(60),p.bucket,p.path,student,JSON.stringify({mimetype:'image/jpeg',size:7})]);
 expect((await db.query('UPDATE storage.objects SET metadata=$1 WHERE id=$2 RETURNING id',[JSON.stringify({size:8,mimetype:'image/jpeg'}),id(60)])).rows).toHaveLength(0);
 expect((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[id(60)])).rows).toHaveLength(0);
 await as(student2);expect((await db.query('SELECT id FROM storage.objects WHERE id=$1',[id(60)])).rows).toHaveLength(0);
});
it('authorized direct unenroll preserves prospective registry/media and clears exact child cascade context',async()=>{
 const p=await prepare();await upload(p);await submit(p);await as(writer);expect((await db.query('DELETE FROM enrollments WHERE id=$1 RETURNING id',[enrollment])).rows).toHaveLength(1);
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM video_identifications WHERE id=$1',[p.identificationId])).n).toBe(0);expect((await one('SELECT count(*)::int n FROM uc_identification_records WHERE id=$1',[p.identificationId])).n).toBe(1);expect((await one('SELECT count(*)::int n FROM storage.objects WHERE id=$1',[id(60)])).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_write_contexts')).n).toBe(0);
 await as(teacher);await denied('SELECT uc_identification_media_context($1,$2)',[p.identificationId,p.sourceId]);await as(student);expect((await one('SELECT uc_identification_media_context($1,$2)value',[p.identificationId,p.sourceId])).value.sourceId).toBe(p.sourceId);
});
it.each(['course','organization'])('authorized %s cascade preserves new private history and cleans witnesses',async(kind)=>{
 const p=await prepare();await upload(p);await submit(p);
 if(kind==='organization'){await db.exec('RESET ROLE');await db.query("INSERT INTO user_roles VALUES($1,'admin')",[writer]);}
 await as(writer);await db.query('DELETE FROM '+(kind==='course'?'courses':'organizations')+' WHERE id=$1',[kind==='course'?course:org]);await db.exec('RESET ROLE');
 expect((await one('SELECT count(*)::int n FROM uc_identification_records WHERE id=$1',[p.identificationId])).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_events')).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_write_contexts')).n).toBe(0);
});
it('registration preserves112 signature/department/conditionalFRDO split and explicit original manual actor',async()=>{
 await as(null,'service_role');const args=[org,student,writer,'Synthetic department',null,null,true];
 const a=(await one('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)value',args)).value;
 const b=(await one('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)value',args)).value;expect(b.identification_id).toBe(a.identification_id);
 await db.exec('RESET ROLE');expect(await one('SELECT source_kind,status,decided_by FROM uc_identification_records WHERE id=$1',[a.identification_id])).toEqual({source_kind:'manual_staff_claim',status:'verified',decided_by:writer});expect((await one('SELECT department FROM profiles WHERE user_id=$1',[student])).department).toBe('Synthetic department');
 await as(null,'service_role');await denied('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)',[org,student,oneRight,null,null,null,true]);
 await denied('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)',[org,student,writer,null,'00000000011',null,true]);
 expect((await one('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)value',[org,student,oneRight,'Department only',null,null,false])).value.identity_confirmed).toBe(false);
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM uc_identification_records')).n).toBe(1);
 await as(null,'service_role');const other=(await one('SELECT save_student_registration_details($1,$2,$3,$4,$5,$6,$7)value',[org,student,owner,null,null,null,true])).value;expect(other.identification_id).not.toBe(a.identification_id);
});
it('registration function changes only approved identity branch and pre-profile lock anchor, retaining remainder and ACL',async()=>{
 await db.exec('RESET ROLE');const original=identificationBaseline.functions.find((f:any)=>f.signature==='save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)').definition;
 const marker="  IF p_confirm_identity IS TRUE THEN\n    SELECT * INTO v_identification";
 const start=original.indexOf(marker),end=original.indexOf("  RETURN jsonb_build_object('success'",start),oldBranch=original.slice(start,end);
 const newBranch='  IF p_confirm_identity IS TRUE THEN\n    v_identification.id:=public.uc_registration_identification_claim(p_organization_id,p_user_id,p_actor_id);\n    SELECT v.* INTO v_identification FROM public.video_identifications v WHERE v.id=v_identification.id;\n  END IF;\n';
 const lock='  IF p_confirm_identity IS TRUE THEN\n    PERFORM public.uc_identification_lock_mutation(p_actor_id,p_organization_id,p_user_id);\n  END IF;\n';
 const body=(await one("SELECT pg_get_functiondef('save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)'::regprocedure) body")).body;
 expect(body.replace(lock,'').replace(newBranch,oldBranch)).toBe(original);
 expect(body.indexOf('PERFORM public.uc_identification_lock_mutation')).toBeLessThan(body.indexOf('SELECT * INTO v_profile'));
 expect((await one("SELECT has_function_privilege('service_role','save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','EXECUTE') service,has_function_privilege('authenticated','save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','EXECUTE') client"))).toEqual({service:true,client:false});
});
it('same actor manual registration claim is not reused after reset or changed canonical context',async()=>{
 await as(null,'service_role');const a=(await one('SELECT save_student_registration_details($1,$2,$3,NULL,NULL,NULL,true)value',[org,student,writer])).value;
 await decision('reset',a.identification_id,1,id(52));await as(null,'service_role');const b=(await one('SELECT save_student_registration_details($1,$2,$3,NULL,NULL,NULL,true)value',[org,student,writer])).value;expect(b.identification_id).not.toBe(a.identification_id);
});
it('canonical current tie uses event UUID, never the unrelated record UUID',async()=>{
 const first=await decision('manual_verify',null,0,id(52));const second=await decision('manual_verify',null,0,id(53));await db.exec('RESET ROLE');
 const sorted=[first.record.identificationId,second.record.identificationId].sort();
 await db.query("UPDATE uc_identification_events SET at='2026-01-01T00:00:00Z',id=CASE identification_id WHEN $1::uuid THEN $3::uuid ELSE $4::uuid END WHERE identification_id=ANY($2::uuid[])",[sorted[0],sorted,id(900),id(800)]);
 await as(student);const s=(await one('SELECT get_student_identification_state($1,$2,true,NULL)value',[org,[student]])).value.subjects[0];expect(s.current.identificationId).toBe(sorted[0]);
});
it.each(['identification','user','organization','enrollment','actor','PID','TX'])('forged cascade witness %s is not authority for direct projection deletion',async(kind)=>{
 await db.exec('RESET ROLE;ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard');await db.query('UPDATE video_identifications SET enrollment_id=$1 WHERE id=$2',[enrollment,legacy]);await db.exec('ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard');
 const fields:any={identification:legacy,user:student,organization:org,enrollment:enrollment,actor:writer};
 if(['identification','user','organization','enrollment','actor'].includes(kind))fields[kind]=id(999);
 await db.query("INSERT INTO uc_identification_write_contexts(kind,identification_id,organization_id,user_id,actor_id,enrollment_id,backend_pid,transaction_id)VALUES('projection_cascade',$1,$2,$3,$4,$5,pg_backend_pid()+$6,txid_current()+$7)",[fields.identification,fields.organization,fields.user,fields.actor,fields.enrollment,kind==='PID'?1:0,kind==='TX'?1:0]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[writer]);
 await denied('DELETE FROM video_identifications WHERE id=$1',[legacy]);
});
it('forged account erase GUC without trusted wrapper context cannot delete or null reviewer',async()=>{
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);
 await as(null,'service_role');await db.query("SELECT set_config('sintagma.account_deletion_erase_user',$1,true)",[student]);
 await denied('DELETE FROM video_identifications WHERE id=$1',[legacy]);await denied('UPDATE video_identifications SET verified_by=NULL WHERE id=$1',[legacy]);
});
it('current null role claim is rejected before any service commit or private projection effect',async()=>{
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false);SET ROLE service_role");
 await denied('SELECT uc_commit_identification_photo($1,$2,$3,1,$4,$5,now(),$6,7)',[student,id(200),id(201),id(202),id(203),'a'.repeat(64)]);
});
it('new private bucket and attribution rows are covered by exact account erasure manifest/counts',async()=>{
 const p=await prepare();await upload(p);await submit(p);await decision('verify',p.identificationId,2);await db.exec('RESET ROLE');
 const files=(await one('SELECT account_deletion_files($1) files',[student])).files;expect(files).toContainEqual(expect.objectContaining({bucket:'student-identification-media',path:p.path,objectId:id(60)}));
 const studentCounts=(await one('SELECT account_deletion_personal_row_counts($1) counts',[student])).counts;
 expect(studentCounts).toContainEqual(expect.objectContaining({table:'uc_identification_sources',column:'user_id',count:1}));
 const reviewerCounts=(await one('SELECT account_deletion_personal_row_counts($1) counts',[writer])).counts;expect(reviewerCounts).toContainEqual(expect.objectContaining({table:'uc_identification_events',column:'actor_id',count:1}));
});
it('actual trusted subject erasure removes only subject registry/projection and clears contexts',async()=>{
 const p=await prepare();await upload(p);await submit(p);await decision('verify',p.identificationId,2);await db.exec('RESET ROLE');
 await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);
 // The real worker removes Storage bytes before SQL erase; this isolated test
 // represents only its metadata completion, never actual disk/network bytes.
 await db.query('DELETE FROM storage.objects WHERE id=$1',[id(60)]);
 await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'synthetic-receipt','full-personal-data-v1','cleanup_pending',$2,'{}','[]',false)",[id(300),student]);
 await as(null,'service_role');expect((await one("SELECT account_deletion_erase_data($1,'synthetic-receipt')value",[id(300)])).value).toEqual({erased:true});
 await db.exec('RESET ROLE');for(const table of ['uc_identification_records','uc_identification_sources','uc_identification_events','uc_identification_requests','uc_identification_write_contexts'])expect((await one(`SELECT count(*)::int n FROM ${table}`)).n).toBe(0);
});
it('actual reviewer erasure clears attribution without voiding another subject outcome/media/history',async()=>{
 const p=await prepare();await upload(p);await submit(p);const reviewed=await decision('verify',p.identificationId,2);await db.exec('RESET ROLE');
 await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[writer]);await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'synthetic-reviewer','full-personal-data-v1','cleanup_pending',$2,'{}','[]',false)",[id(301),writer]);
 await as(null,'service_role');expect((await one("SELECT account_deletion_erase_data($1,'synthetic-reviewer')value",[id(301)])).value).toEqual({erased:true});await db.exec('RESET ROLE');
 expect(await one('SELECT status,revision,decided_by FROM uc_identification_records WHERE id=$1',[p.identificationId])).toEqual({status:'verified',revision:3,decided_by:null});
 expect((await one('SELECT verified_by FROM video_identifications WHERE id=$1',[p.identificationId])).verified_by).toBe(null);expect((await one('SELECT count(*)::int n FROM uc_identification_events WHERE identification_id=$1',[p.identificationId])).n).toBe(2);expect((await one('SELECT count(*)::int n FROM storage.objects WHERE id=$1',[id(60)])).n).toBe(1);
 await as(student);const state=(await one('SELECT get_student_identification_state($1,$2,true,NULL)value',[org,[student]])).value.subjects[0];expect(state.current.decidedAt).toBe(reviewed.record.decidedAt);expect(state.current.assurance).toBe('current_server_review');
});
it('legacy capture namespace blocks old-tab upload/overwrite/rename while ordinary avatars and historical deletion remain',async()=>{
 const oldPath=student+'/verification_1729000000000.jpg',avatar=student+'/avatar.jpg';
 await as(student);await denied("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,'avatars',$2,$3,'{}')",[id(62),oldPath,student]);
 await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,'avatars',$2,$3,'{}')",[id(63),avatar,student]);
 await db.query('UPDATE storage.objects SET metadata=$1 WHERE id=$2',[JSON.stringify({ordinary:true}),id(63)]);
 await denied('UPDATE storage.objects SET name=$1 WHERE id=$2',[oldPath,id(63)]);
 await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata)VALUES($1,'avatars',$2,$3,'{}')",[id(62),oldPath,student]);
 await as(student);expect((await db.query('UPDATE storage.objects SET metadata=$1 WHERE id=$2 RETURNING id',[JSON.stringify({overwrite:true}),id(62)])).rows).toHaveLength(0);
 expect((await db.query('SELECT id FROM storage.objects WHERE id=$1',[id(62)])).rows).toHaveLength(1);expect((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[id(62)])).rows).toHaveLength(1);
 await db.exec('RESET ROLE');expect((await one("SELECT public FROM storage.buckets WHERE id='avatars'")).public).toBe(true);
});
it('new PUBLIC guards independently preserve anonymous unrelated metadata and return false for the private predicate',async()=>{
 await db.exec('RESET ROLE');
 // Earlier UC document guards already have a separate anon EXECUTE limitation.
 // Isolate only this release's guards in a rolled-back fixture; do not change
 // those historical policies/grants in the product to manufacture a broad PASS.
 const oldPolicies=(await db.query<any>("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname NOT LIKE 'uc_identification_%'")).rows;
 for(const p of oldPolicies)await db.exec('DROP POLICY "'+p.policyname.replaceAll('"','""')+'" ON storage.objects');
 await db.exec("CREATE POLICY uc114_fixture_anon_public ON storage.objects FOR SELECT TO anon USING(bucket_id='unrelated-public');INSERT INTO storage.objects(id,bucket_id,name,metadata)VALUES('e0000000-0000-4000-8000-000000000064','unrelated-public','public.jpg','{}')");
 await as(null,'anon');expect((await db.query('SELECT id FROM storage.objects WHERE id=$1',[id(64)])).rows).toHaveLength(1);
 expect((await one("SELECT uc_identification_storage_allowed('student-identification-media','guess',false) allowed")).allowed).toBe(false);
 await denied('SELECT uc_identification_media_context($1,$2)',[id(66),id(67)]);
});
it.each(['user','organization'])('corrupt preserved legacy child %s cannot borrow authorization from a parent enrollment',async(kind)=>{
 await db.exec('RESET ROLE;ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard');
 await db.query('UPDATE video_identifications SET enrollment_id=$1,user_id=$2,organization_id=$3 WHERE id=$4',[enrollment,kind==='user'?student2:student,kind==='organization'?foreign:org,legacy]);await db.exec('ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard');
 await as(writer);await denied('DELETE FROM enrollments WHERE id=$1',[enrollment]);await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM video_identifications WHERE id=$1',[legacy])).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_write_contexts')).n).toBe(0);
});
it('actual unchanged cancellation safely retains a referenced identity enrollment; no DELETE bypass introduced',async()=>{
 const p=await prepare();await upload(p);await submit(p);await as(owner);await denied('SELECT cancel_course_assignment($1,$2)',[enrollment,org],'23514');
 await db.exec('RESET ROLE');expect((await one('SELECT count(*)::int n FROM enrollments WHERE id=$1',[enrollment])).n).toBe(1);expect((await one('SELECT count(*)::int n FROM uc_identification_sources')).n).toBe(1);
});
it('mutation acquires actual subject/actor erasure advisory locks in UUID order before profile/registry row locks',async()=>{
 await db.exec('RESET ROLE;CREATE TEMP TABLE uc114_advisory_observed(sequence bigserial,u uuid,held_count integer,exact_held boolean)');
 const alreadyHeld=(await one("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted")).n;
 const signature='uc_identification_lock_mutation(uuid,uuid,uuid)',body=(await one(`SELECT pg_get_functiondef('${signature}'::regprocedure) body`)).body;
 const anchor='PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));';expect(body.split(anchor)).toHaveLength(2);
 const observed=body.replace(anchor,anchor+" INSERT INTO pg_temp.uc114_advisory_observed(u,held_count,exact_held) SELECT u,count(*),bool_or(classid::bigint=((hashtextextended(u::text,42007)>>32)&4294967295) AND objid::bigint=(hashtextextended(u::text,42007)&4294967295) AND objsubid=1) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted;");
 await db.exec(observed);await decision('manual_verify',null,0);await db.exec('RESET ROLE');
 const rows=(await db.query('SELECT u,held_count,exact_held FROM uc114_advisory_observed ORDER BY sequence')).rows;expect(rows.map(r=>r.u)).toEqual([student,writer]);expect(rows.every(r=>r.held_count>=alreadyHeld&&r.exact_held===true)).toBe(true);
 expect(body.indexOf(anchor)).toBeLessThan(body.indexOf('FOR UPDATE'));
});
it('actual cross-reviewed erasure prelocks all owned/current/historical/receipt parent records in UUID order before mutation',async()=>{
 const first=await decision('manual_verify',null,0,id(52));await as(null,'service_role');await db.exec('RESET ROLE');
 // Actual canonical helper excludes current staff as student targets. A lawful
 // historical cross-review requires a role transition, not simultaneous bypass:
 // former reviewer B becomes a learner; former learner A becomes scoped staff.
 await db.query("INSERT INTO user_roles VALUES($1,'student')",[writer]);await db.query('DELETE FROM org_staff WHERE user_id=$1 AND organization_id=$2',[writer,org]);
 await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom','[\"students.write\",\"documents.write\"]')",[student,org]);
 await as(student);const second=(await one("SELECT decide_student_identification($1,$2,$3,'manual_verify',NULL,0,NULL)value",[org,writer,id(53)])).value;
 await db.exec('RESET ROLE');
 // A receipt-only relation exercises the fourth union branch without pretending
 // that an ordinary client can write the private registry.
 await db.query("INSERT INTO uc_identification_records(id,user_id,organization_id,scope_kind,projection_owned,origin,source_kind,status)VALUES($1,$2,$3,'subject',false,'prospective','manual_staff_claim','pending')",[id(700),student2,org]);
 await db.query("INSERT INTO uc_identification_requests(actor_id,operation,request_id,payload_sha256,identification_id,result)VALUES($1,'decision',$2,$3,$4,'{}')",[student,id(701),'b'.repeat(64),id(700)]);
 await db.exec('CREATE TEMP TABLE uc114_parent_lock_observed(sequence bigserial,record_id uuid,owned_rows integer)');
 const body=(await one("SELECT pg_get_functiondef('uc_erase_identification_data(uuid)'::regprocedure) body")).body;
 const anchor='PERFORM 1 FROM public.uc_identification_records WHERE id=record_id FOR UPDATE;';expect(body.split(anchor)).toHaveLength(2);
 await db.exec(body.replace(anchor,anchor+' INSERT INTO pg_temp.uc114_parent_lock_observed(record_id,owned_rows) SELECT record_id,count(*) FROM public.uc_identification_records WHERE user_id=p_user;'));
 await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);await db.query("INSERT INTO account_deletion_jobs(id,receipt_hash,consent_version,state,user_id,snapshot,files,data_erased)VALUES($1,'cross-review','full-personal-data-v1','cleanup_pending',$2,'{}','[]',false)",[id(302),student]);
 await as(null,'service_role');expect((await one("SELECT account_deletion_erase_data($1,'cross-review')value",[id(302)])).value).toEqual({erased:true});await db.exec('RESET ROLE');
 const rows=(await db.query('SELECT record_id,owned_rows FROM uc114_parent_lock_observed ORDER BY sequence')).rows;expect(rows.map(r=>r.record_id)).toEqual([first.record.identificationId,second.record.identificationId,id(700)].sort());expect(rows.every(r=>r.owned_rows===1)).toBe(true);
 expect((await one('SELECT status,decided_by FROM uc_identification_records WHERE id=$1',[second.record.identificationId]))).toEqual({status:'verified',decided_by:null});
});
it('default assigned teacher retains safe history/media read and cannot turn read into a decision',async()=>{
 const p=await prepare();await upload(p);await submit(p);await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[]' WHERE id=$1",[staff]);await as(teacher);
 expect((await one('SELECT uc_identification_media_context($1,$2)value',[p.identificationId,p.sourceId])).value.actorId).toBe(teacher);
 await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(52),'verify',p.identificationId,2,null]);
});
it.each(['viewer','sales_manager','expired_admin'])('current mixed platform %s affiliation fences canonical learner SELF without the app-admin role',async(kind)=>{
 await as(null,'service_role');await db.exec('RESET ROLE');await db.query("INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,$2,$3)",[student,kind==='expired_admin'?'admin':kind,kind==='expired_admin'?'2000-01-01T00:00:00Z':null]);
 expect((await one('SELECT uc_identification_target_allowed($1,$2,true) allowed',[org,student])).allowed).toBe(true);await as(student);await denied('SELECT prepare_own_identification_photo($1,$2,NULL)',[org,id(50)]);
});
it('current role revocation blocks exact old decision and submission receipt replay',async()=>{
 const p=await prepare();await upload(p);await submit(p);await decision('verify',p.identificationId,2);await as(null,'service_role');await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET sections_access='[\"students.read\",\"documents.read\"]' WHERE user_id=$1",[writer]);
 await as(writer);await denied('SELECT decide_student_identification($1,$2,$3,$4,$5,$6,$7)',[org,student,id(52),'verify',p.identificationId,2,null]);
 await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations VALUES($1)',[student]);await as(student);await denied('SELECT uc_identification_submit_context($1,$2,1,$3)',[p.identificationId,p.sourceId,id(51)]);
});
it('a current write-only eligible reviewer can read the exact review item without a separate read key',async()=>{
 const p=await prepare();await upload(p);await submit(p);await as(writer);const s=(await one('SELECT get_student_identification_state($1,$2,true,$3)value',[org,[student],enrollment])).value.subjects[0];expect(s.current.capabilities.canReview).toBe(true);expect((await one('SELECT uc_identification_media_context($1,$2)value',[p.identificationId,p.sourceId])).value.actorId).toBe(writer);
});
it('ordinary API cannot insert any private transition witness or call actor-parameterized helpers',async()=>{
 await as(writer);await denied("INSERT INTO uc_identification_write_contexts(kind,user_id,actor_id)VALUES('review',$1,$2)",[student,writer]);await denied('SELECT uc_apply_identification_decision($1,$2,$3,$4,$5,NULL,0,NULL,false)',[owner,org,student,id(52),'manual_verify']);
});
it('no new mutation accepts a repeatable-read permission snapshot',async()=>{
 await db.exec('ROLLBACK;BEGIN ISOLATION LEVEL REPEATABLE READ');await as('00000000-0000-4000-8000-000000000001');await denied('SELECT prepare_own_identification_photo($1,$2,NULL)',['00000000-0000-4000-8000-000000000100',id(50)],'25000');
});
