// @vitest-environment node
import { beforeAll,beforeEach,afterEach,afterAll,it,expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createUcEducationProfileFixture,educationProfileMigration } from '../../functions/_shared/uc-education-profile.fixture';
import { createEmptyEducationProfile,parseEducationProfile } from '../../../src/lib/uc-compliance/model';
import { CATALOG_VERSION,REQUIREMENT_IDS } from '../../../src/lib/uc-compliance/catalog';
const id=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),owner=id(3),writer=id(4),reader=id(5),teacher=id(6),viewer=id(7),admin=id(8),student=id(9);
const staff=id(10),writerStaff=id(11),group=id(12),doc=id(13),foreignDoc=id(14),versionedDoc=id(15);
let db:PGlite;
const tables=['organization_education_profiles','organization_education_profile_history','organization_document_applicability_decisions','organization_document_applicability_history'];
const empty=createEmptyEducationProfile;
const as=async(u:string|null,role='authenticated')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${u||''}',false);SELECT set_config('request.jwt.claim.role','${role}',false);SET ROLE ${role};`);
const row=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
async function denied(sql:string,args:any[]=[],code='42501',message?:RegExp){
 await db.exec('SAVEPOINT denied');try{await db.query(sql,args);throw new Error('Expected query rejection');}
 catch(e:any){expect(e.code).toBe(code);if(message)expect(e.message).toMatch(message);}
 finally{await db.exec('ROLLBACK TO denied');}
}
const saveSql='SELECT save_organization_education_profile($1,$2,$3,$4) data';
const saveArgs=(p:any=empty(),revision=0,request=id(100),tenant=org)=>[tenant,revision,JSON.stringify(p),request];
const save=async(p:any=empty(),revision=0,request=id(100),tenant=org)=>(await row(saveSql,saveArgs(p,revision,request,tenant))).data;
const get=async(tenant=org)=>(await row('SELECT get_organization_education_profile($1) data',[tenant])).data;
const decisionSql='SELECT save_organization_document_applicability_decision($1,$2,$3,$4,$5,$6,$7,$8) data';
const decisionArgs=(over:any={})=>[over.org??org,over.requirement??'license',over.revision??0,over.profileRevision??1,over.catalog??CATALOG_VERSION,
 Object.hasOwn(over,'decision')?over.decision:'not_applicable',over.reason??'Explicit synthetic declaration',over.request??id(200)];
const decide=async(over:any={})=>(await row(decisionSql,decisionArgs(over))).data;
const list=async()=>(await row('SELECT list_organization_document_applicability_decisions($1) data',[org])).data;
beforeAll(async()=>{
 db=await createUcEducationProfileFixture(false);
 await db.exec('BEGIN;CREATE OR REPLACE FUNCTION uc_document_action_allowed(p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$SELECT true$$');
 await expect(db.exec(educationProfileMigration)).rejects.toThrow(/unreviewed document access baseline/);await db.exec('ROLLBACK');
 // Execute a Windows checkout form inside a rollback, then the exact canonical LF form.
 await db.exec('BEGIN');await db.exec(educationProfileMigration.replace(/\n/g,'\r\n').replace(/\r\n/g,'\n'));
 expect((await row("SELECT to_regclass('organization_education_profiles') IS NOT NULL present")).present).toBe(true);
 await db.exec('ROLLBACK');
 expect((await row("SELECT to_regclass('organization_education_profiles') IS NULL absent")).absent).toBe(true);
 await db.exec('BEGIN');await db.exec(educationProfileMigration);await db.exec('COMMIT');
},30000);
beforeEach(async()=>{
 await db.exec(`RESET ROLE;BEGIN;SELECT set_config('request.jwt.claim.sub','',false);SELECT set_config('request.jwt.claim.role','service_role',false);
 INSERT INTO organizations(id,name)VALUES('${org}','Synthetic A'),('${other}','Synthetic B');
 INSERT INTO profiles(user_id,organization_id,full_name)VALUES('${owner}','${org}','Owner'),('${writer}','${other}','Writer'),('${reader}','${org}','Reader'),('${teacher}','${org}','Teacher'),('${student}','${org}','Student');
 INSERT INTO user_roles VALUES('${owner}','organization'),('${viewer}','admin'),('${admin}','admin'),('${student}','student');
 INSERT INTO admin_staff(user_id,role)VALUES('${viewer}','viewer');
 INSERT INTO org_staff(id,user_id,organization_id,role,sections_access)VALUES
 ('${writerStaff}','${writer}','${org}','custom','["documents.read","documents.write"]'),
 ('${id(16)}','${reader}','${org}','custom','["documents.read"]'),
 ('${staff}','${teacher}','${org}','teacher','["documents.read","documents.write"]');
 INSERT INTO student_groups(id,organization_id,name)VALUES('${group}','${org}','Assigned');`);
 await as(owner);
 await db.query('SELECT set_org_staff_document_groups($1,$2,$3,$4)',[org,staff,[group],0]);
 await db.query("INSERT INTO org_documents(id,organization_id,name,type)VALUES($1,$2,'Unversioned evidence','license')",[doc,org]);
 await db.query("INSERT INTO org_documents(id,organization_id,name,type,file_url)VALUES($1,$2,'Versioned evidence','license','https://example.invalid/declared.pdf')",[versionedDoc,org]);
 await as(admin);
 await db.query("INSERT INTO org_documents(id,organization_id,name,type)VALUES($1,$2,'Other tenant evidence','license')",[foreignDoc,other]);
 await as(owner);
});
afterEach(async()=>db.exec('ROLLBACK;RESET ROLE'));
afterAll(async()=>db?.close());

it('absent profiles return exact all-unknown model without inserting or borrowing organization values',async()=>{
 const r=await get();expect(r).toEqual({organization_id:org,revision:0,profile:empty(),updated_at:null,updated_by:null});
 expect(parseEducationProfile(r.profile)).toEqual(empty());
 expect((await list())).toEqual([]);
 await db.exec('RESET ROLE');for(const t of tables)expect(await row(`SELECT count(*)::int n FROM ${t}`)).toEqual({n:0});
});
it('owner saves explicit false/empty arrays and declarations, preserving existing organization and document rows',async()=>{
 const p=empty();p.educationalActivity=false;p.programTypes=[];p.specialAreas=[];p.license.status='declared_exempt';p.license.exemptionReason='Declaration, not verification';
 const before=await row("SELECT jsonb_agg(to_jsonb(d) ORDER BY id) rows FROM org_documents d");
 const r=await save(p);expect(r).toMatchObject({organization_id:org,revision:1,profile:p,updated_by:owner});expect(r.updated_at).toBeTypeOf('string');
 expect(await get()).toEqual(r);expect(await row("SELECT jsonb_agg(to_jsonb(d) ORDER BY id) rows FROM org_documents d")).toEqual(before);
 expect(await row('SELECT name,inn FROM organizations WHERE id=$1',[org])).toEqual({name:'Synthetic A',inn:null});
});
it('multi-organization custom writer can save exact authorized organization without changing primary profile',async()=>{
 await as(writer);expect((await save()).updated_by).toBe(writer);
 await denied(saveSql,saveArgs(empty(),0,id(101),other));
});
it.each([reader,teacher,viewer,student])('denies org-wide mutation by %s, even assigned teacher writer',async(user)=>{
 await as(user);await denied(saveSql,saveArgs());await denied(decisionSql,decisionArgs());
 if([reader,viewer].includes(user))expect((await get()).revision).toBe(0);
 else await denied('SELECT get_organization_education_profile($1)',[org]);
});
it('denies anonymous, NULL-auth service and foreign-organization reads without response leakage',async()=>{
 await as(null);await denied(saveSql,saveArgs());await denied('SELECT get_organization_education_profile($1)',[org]);
 await as(null,'anon');await denied('SELECT get_organization_education_profile($1)',[org]);
 await as(null,'service_role');await denied(saveSql,saveArgs());
 await as(owner);await denied('SELECT get_organization_education_profile($1)',[other]);
});
it('revocation and expired staff/platform roles deny new saves and even exact retries',async()=>{
 await as(writer);await save();
 await db.exec(`RESET ROLE;UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE id='${writerStaff}';`);
 await as(writer);await denied(saveSql,saveArgs());
 await as(null,'service_role');await db.exec(`RESET ROLE;UPDATE org_staff SET expires_at=NULL WHERE id='${writerStaff}';INSERT INTO account_deletion_revocations VALUES('${writer}');INSERT INTO admin_staff(user_id,role,expires_at)VALUES('${admin}','admin',now()-interval '1 day');`);
 for(const u of [writer,admin]){await as(u);await denied(saveSql,saveArgs());}
});
it('new confirmations create sequential history, old exact retry returns original receipt without overwriting current',async()=>{
 const first=await save();const p=empty();p.usesDistanceLearning=true;
 const second=await save(p,1,id(101));expect(second.revision).toBe(2);
 expect(await save()).toEqual(first);expect(await get()).toEqual(second);
 const third=await save(p,2,id(102));expect(third.revision).toBe(3);
 const history=(await row('SELECT list_organization_education_profile_history($1,2,NULL) data',[org])).data;
 expect(history.map((r:any)=>r.revision)).toEqual([3,2]);
 expect((await row('SELECT list_organization_education_profile_history($1,2,2) data',[org])).data).toEqual([first]);
});
it('CAS rejects stale independent requests, and a reused UUID cannot change actor/body/expected revision',async()=>{
 await save();await denied(saveSql,saveArgs(empty(),0,id(101)),'40001');
 const changed=empty();changed.paidEducation=true;
 await denied(saveSql,saveArgs(changed),'22023');await denied(saveSql,saveArgs(empty(),1),'22023');
 await as(writer);await denied(saveSql,saveArgs());
});
it('current rows and history cannot be written directly, read RLS survives an extra permissive policy',async()=>{
 await save();await decide();
 for(const t of tables){await denied(`DELETE FROM ${t}`);await denied(`UPDATE ${t} SET organization_id=$1`,[other]);}
 await db.exec('RESET ROLE');
 for(const t of tables)await db.exec(`CREATE POLICY fixture_broad_read ON ${t} FOR SELECT TO authenticated USING(true)`);
 await as(student);
 for(const t of tables){expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(0);await denied(`DELETE FROM ${t}`);}
});
it('released direct SELECT boundaries protect every profile/decision table across tenant, teacher and revocation',async()=>{
 await save();await decide();
 for(const u of [teacher,student]){await as(u);for(const t of tables)expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(0);}
 await as(writer);for(const t of tables)expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(1);
 await db.exec(`RESET ROLE;INSERT INTO account_deletion_revocations VALUES('${writer}');`);await as(writer);
 for(const t of tables)expect((await db.query(`SELECT * FROM ${t}`)).rows).toHaveLength(0);
});
it('history is immutable even to privileged direct UPDATE/DELETE; legitimate empty-org cascade is preserved',async()=>{
 await save();await decide();await db.exec('RESET ROLE');
 await denied("UPDATE organization_education_profile_history SET profile='{}'");
 await denied('DELETE FROM organization_document_applicability_history');
 // Existing document-version retention is deliberately untouched. Exercise a separate empty organization.
 await db.query("INSERT INTO organizations(id,name)VALUES($1,'Empty synthetic tenant')",[id(55)]);
 await as(admin);await save(empty(),0,id(56),id(55));await decide({org:id(55),request:id(57)});
 await db.exec('RESET ROLE');await db.query('DELETE FROM organizations WHERE id=$1',[id(55)]);
 for(const t of tables)expect(await row(`SELECT count(*)::int n FROM ${t} WHERE organization_id=$1`,[id(55)])).toEqual({n:0});
});
it.each([
 (p:any)=>{delete p.legalForm},(p:any)=>{p.official_verified=true},(p:any)=>{p.legalForm='company'},
 (p:any)=>{p.educationalActivity='false'},(p:any)=>{p.programTypes=['dpo_upskilling','dpo_upskilling']},
 (p:any)=>{p.specialAreas=['invented']},(p:any)=>{p.license.status='official_verified'},(p:any)=>{p.license.checkedOn='2026-02-30'},
 (p:any)=>{p.license.registryNumber='   '},(p:any)=>{p.license.sourceUrl='http://example.invalid'},
 (p:any)=>{p.license.registryNumber='\t\n'},
 (p:any)=>{p.license.sourceUrl='https://user:pass@example.invalid'},(p:any)=>{p.license.evidenceVersionId=id(999)},
 (p:any)=>{p.license.sourceUrl='https://example.invalid:99999'},(p:any)=>{p.license.sourceUrl='https://example.invalid:bad'},
 (p:any)=>{p.license.sourceUrl='https://999.999.999.999'},
])('strictly rejects unknown, malformed or misleading declaration fields (%#)',async(change)=>{
 const p=empty();change(p);await denied(saveSql,saveArgs(p),'22023');
});
it('declared evidence URLs preserve valid HTTPS domains, IDNs, paths and bounded ports without fetching them',async()=>{
 let revision=0;
 for(const [i,url] of ['https://example.invalid/registry?q=1#entry','https://реестр.рф/лицензия','https://example.invalid:8443/path','https://[2001:db8::1]/path','HTTPS://Example.invalid/CaseSensitive/Path?Query=VALUE'].entries()){
  const p=empty();p.license.sourceUrl=url;expect(parseEducationProfile(p)).toEqual(p);
  expect((await save(p,revision,id(900+i))).profile).toEqual(p);revision++;
 }
});
it('same-tenant existing evidence and exact version are bound; foreign/deleted/wrong-version links fail',async()=>{
 const p=empty();p.license.evidenceDocumentId=doc;expect((await save(p)).profile).toEqual(p);
 const ver=(await row('SELECT current_version_id FROM org_documents WHERE id=$1',[versionedDoc])).current_version_id;
 p.license.evidenceDocumentId=versionedDoc;await denied(saveSql,saveArgs(p,1,id(101)),'22023');
 p.license.evidenceVersionId=ver;expect((await save(p,1,id(101))).revision).toBe(2);
 p.license.evidenceDocumentId=doc;await denied(saveSql,saveArgs(p,2,id(102)),'22023');
 p.license.evidenceDocumentId=foreignDoc;p.license.evidenceVersionId=null;await denied(saveSql,saveArgs(p,2,id(102)),'22023');
 p.license.evidenceDocumentId=doc;await db.query('UPDATE org_documents SET deleted_at=now() WHERE id=$1',[doc]);
 await denied(saveSql,saveArgs(p,2,id(102)),'22023');
});
it('late history failure rolls back profile current state and request receipt together',async()=>{
 await db.exec("RESET ROLE;CREATE FUNCTION fixture_fail_history()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'late fixture failure';END$$;CREATE TRIGGER fixture_fail AFTER INSERT ON organization_education_profile_history FOR EACH ROW EXECUTE FUNCTION fixture_fail_history()");
 await as(owner);await denied(saveSql,saveArgs(),'P0001',/late fixture failure/);
 expect((await get()).revision).toBe(0);expect((await row('SELECT list_organization_education_profile_history($1) data',[org])).data).toEqual([]);
 await db.exec('RESET ROLE;DROP TRIGGER fixture_fail ON organization_education_profile_history');await as(owner);expect((await save()).revision).toBe(1);
});
it('catalog allowlist exactly matches the shipped TypeScript catalog and rejects an invented or old catalog',async()=>{
 await save();
 for(const [i,key] of REQUIREMENT_IDS.entries())expect((await decide({requirement:key,request:id(300+i)})).requirement_id).toBe(key);
 expect((await list())).toHaveLength(32);
 await denied(decisionSql,decisionArgs({requirement:'invented'}),'22023');await denied(decisionSql,decisionArgs({catalog:'old'}),'22023');
});
it('decisions require saved current profile; declarations do not claim legal verification and exact replay is stable',async()=>{
 await denied(decisionSql,decisionArgs(),'40001');await save();
 const first=await decide();expect(first).toMatchObject({decision:'not_applicable',profile_revision:1,revision:1,decided_by:owner});
 expect(first).not.toHaveProperty('official_verified');expect(await decide()).toEqual(first);
 const p=empty();p.educationalActivity=true;await save(p,1,id(101));
 expect(await decide()).toEqual(first);expect((await list())[0].profile_revision).toBe(1);
 await denied(decisionSql,decisionArgs({revision:1,request:id(201)}),'40001');
});
it('decision CAS, request payload/actor binding and explicit revoke preserve all history snapshots',async()=>{
 await save();const first=await decide();
 await denied(decisionSql,decisionArgs({request:id(201)}),'40001');
 await denied(decisionSql,decisionArgs({reason:'changed'}),'22023');
 await denied(decisionSql,decisionArgs({requirement:'charter'}),'22023');
 await as(writer);await denied(decisionSql,decisionArgs());await as(owner);
 const revoked=await decide({revision:1,decision:null,reason:'Withdraw declaration',request:id(201)});
 expect(revoked).toMatchObject({revision:2,decision:null});expect((await list())).toEqual([revoked]);
 const history=(await row('SELECT list_organization_document_applicability_history($1,$2) data',[org,'license'])).data;
 expect(history.map((x:any)=>x.revision)).toEqual([2,1]);expect(history[1]).toMatchObject({...first,profile_snapshot:empty()});
 await denied(decisionSql,decisionArgs({revision:2,reason:' ',request:id(202)}),'22023');
 await denied(decisionSql,decisionArgs({revision:2,reason:'\t\n',request:id(202)}),'22023');
});
it('late decision history failure cannot leave a changed current decision or consumed request',async()=>{
 await save();await decide();
 await db.exec("RESET ROLE;CREATE FUNCTION fixture_fail_decision()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'late decision failure';END$$;CREATE TRIGGER fixture_fail AFTER INSERT ON organization_document_applicability_history FOR EACH ROW EXECUTE FUNCTION fixture_fail_decision()");
 await as(owner);await denied(decisionSql,decisionArgs({revision:1,decision:null,request:id(201)}),'P0001');
 expect((await list())[0]).toMatchObject({revision:1,decision:'not_applicable'});
 await db.exec('RESET ROLE;DROP TRIGGER fixture_fail ON organization_document_applicability_history');await as(owner);
 expect((await decide({revision:1,decision:null,request:id(201)})).revision).toBe(2);
});
it('history RPCs bound pagination and require same active org-wide read permissions',async()=>{
 await save();await decide();
 await denied('SELECT list_organization_education_profile_history($1,101,NULL)',[org],'22023');
 await denied('SELECT list_organization_document_applicability_history($1,$2,0,NULL)',[org,'license'],'22023');
 await as(teacher);await denied('SELECT list_organization_education_profile_history($1)',[org]);
 await denied('SELECT list_organization_document_applicability_history($1,$2)',[org,'license']);
});

