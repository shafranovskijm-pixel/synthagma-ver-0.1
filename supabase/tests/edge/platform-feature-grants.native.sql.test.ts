// @vitest-environment node
// Native PostgreSQL17 only: no PGlite fallback can satisfy this suite.
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createMonthlyQuotaFixture,seedQuotaOrganization,asQuotaActor as actor,quotaId as id,quotaRow as row,type QuotaDb} from '../../functions/_shared/monthly-course-quota.fixture';
const org=id(1),owner=id(20),learner=id(10),staff=id(21),foreign=id(22);
const migration=new URL('../../migrations/20261021140000_administrative_platform_feature_grant.sql',import.meta.url);
const fixture=new URL('../../functions/_shared/__tests__/fixtures/platform-feature-grants-live-functions.json',import.meta.url);
const md5=(s:string)=>createHash('md5').update(s).digest('hex');
const profile=async(db:QuotaDb,target=org)=>(await row(db,'SELECT get_postpaid_access_profile($1) p',[target])).p;
const crm=async(db:QuotaDb,permission='sales.read',target=org)=>(await row(db,'SELECT org_crm_access_allowed($1,$2) allowed',[target,permission])).allowed;
async function reject42501(db:QuotaDb,sql:string,args:any[]=[]){await db.exec('SAVEPOINT denied');let error:any;try{await db.query(sql,args);}catch(e){error=e;}await db.exec('ROLLBACK TO denied;RELEASE denied');expect(error?.code).toBe('42501');}
async function grant(db:QuotaDb){await db.exec('RESET ROLE');await db.query("UPDATE organizations SET custom_enabled_categories=array_append(coalesce(custom_enabled_categories,'{}'::text[]),'platform_all_features') WHERE id=$1",[org]);await actor(db,owner);}
async function agreement(db:QuotaDb){await db.exec('RESET ROLE');await db.query("INSERT INTO organization_billing_agreements(organization_id,effective_from,contract_reference,customer_confirmation,created_by)VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date,'Synthetic existing contract','Synthetic preexisting base confirmation only',$2)",[org,owner]);await actor(db,owner);}
describe('Administrative platform-feature grant preserves paid evidence and authorization',()=>{
 let db:QuotaDb;let metadataBefore:any[];let runtimeMetadataAfter:any[];
 beforeAll(async()=>{
  if(typeof(globalThis as any).__lessonCreateNativeFixture!=='function')throw Error('Native PostgreSQL17 constructor required; embedded fallback forbidden');
  db=await createMonthlyQuotaFixture(true);
  const captured=JSON.parse(await readFile(fixture,'utf8'));
  await db.exec(captured.confirmationDDL);
  for(const f of captured.functions){if(md5(f.definition)!==f.definition_md5)throw Error('Captured function definition drift '+f.signature);await db.exec(f.definition);if((await row(db,'SELECT md5(prosrc) hash FROM pg_proc WHERE oid=to_regprocedure($1)',['public.'+f.signature])).hash!==f.source_md5)throw Error('Captured function source drift '+f.signature);}
  for(const t of captured.triggers)await db.exec(t.definition);
  for(const signature of ['get_postpaid_access_profile(uuid)','org_crm_access_allowed(uuid,text)']){
   await db.exec('REVOKE ALL ON FUNCTION public.'+signature+' FROM PUBLIC,anon,authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch,lesson_fixture_default_grantee');
   await db.exec('GRANT EXECUTE ON FUNCTION public.'+signature+' TO authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch');
  }
  const metadataSQL="SELECT oid::regprocedure::text signature,to_jsonb(p)-'prosrc' metadata FROM pg_proc p WHERE oid IN('get_postpaid_access_profile(uuid)'::regprocedure,'org_crm_access_allowed(uuid,text)'::regprocedure)ORDER BY 1";
  metadataBefore=(await db.query(metadataSQL)).rows;
  const raw=await readFile(migration,'utf8');if(createHash('sha256').update(raw).digest('hex')!=='c1a9ae5c3a07fc36183abff64982542a8ec5a4c85c033ac161ea3b9720fe6759')throw Error('Reviewed feature-grant migration bytes changed');
  if((raw.match(/^BEGIN;$/gm)??[]).length!==1||!raw.endsWith('COMMIT;\n'))throw Error('Feature grant transaction framing changed');
  const body=raw.replace(/^BEGIN;\n/m,'').replace(/COMMIT;\n$/,'');await db.exec('BEGIN');try{await db.exec(body);await db.exec('COMMIT');}catch(error){await db.exec('ROLLBACK');throw error;}
  runtimeMetadataAfter=(await db.query(metadataSQL)).rows;
 },30000);
 beforeEach(async()=>{await db.exec('RESET ROLE;BEGIN');await seedQuotaOrganization(db);});
 afterEach(async()=>{await db.exec('ROLLBACK;RESET SESSION AUTHORIZATION;RESET ROLE');});afterAll(async()=>db?.close());
 it('preserves all metadata/ACLs of both existing functions and anonymous denial',async()=>{
  expect(runtimeMetadataAfter).toEqual(metadataBefore);
  await actor(db,null,'anon');await reject42501(db,'SELECT get_postpaid_access_profile($1)',[org]);
  await reject42501(db,"SELECT org_crm_access_allowed($1,'sales.read')",[org]);
 });
 it('unlocks all-feature access without creating paid confirmations or changing existing organization/contract facts',async()=>{
  await agreement(db);await db.exec('RESET ROLE');
  const before=await row(db,"SELECT to_jsonb(o)-'custom_enabled_categories' org,md5(to_jsonb(a)::text) agreement FROM organizations o JOIN organization_billing_agreements a ON a.organization_id=o.id WHERE o.id=$1",[org]);
  await grant(db);expect((await profile(db)).entitlements).toEqual({all_platform_features:true});
  expect((await profile(db)).features).toEqual({crm:false,webinar:false,videoserviceplus:false,frdoplus:false});expect(await crm(db)).toBe(true);
  await db.exec('RESET ROLE');expect((await row(db,'SELECT count(*)::int n FROM postpaid_feature_confirmations')).n).toBe(0);
  expect(await row(db,"SELECT to_jsonb(o)-'custom_enabled_categories' org,md5(to_jsonb(a)::text) agreement FROM organizations o JOIN organization_billing_agreements a ON a.organization_id=o.id WHERE o.id=$1",[org])).toEqual(before);
 });
 it('ignores the administrative marker without an active postpaid agreement',async()=>{
  await grant(db);expect((await profile(db)).entitlements).toEqual({all_platform_features:false});expect(await crm(db)).toBe(false);
  await agreement(db);expect((await profile(db)).entitlements.all_platform_features).toBe(true);
  await db.exec('RESET ROLE');await db.query("UPDATE organization_billing_agreements SET effective_from=(now() AT TIME ZONE 'Europe/Moscow')::date-2,effective_to=(now() AT TIME ZONE 'Europe/Moscow')::date WHERE organization_id=$1",[org]);
  await actor(db,owner);expect((await profile(db)).active).toBe(false);expect((await profile(db)).entitlements.all_platform_features).toBe(false);expect(await crm(db)).toBe(false);
 });
 it('keeps CRM write permissions independent from an all-features grant',async()=>{
  await agreement(db);await grant(db);await db.exec('RESET ROLE');
  await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access)VALUES($1,$2,'custom',$3::jsonb)",[staff,org,JSON.stringify(['sales.read'])]);
  await actor(db,staff);expect((await profile(db)).entitlements.all_platform_features).toBe(true);expect(await crm(db)).toBe(true);expect(await crm(db,'sales.write')).toBe(false);
  await db.exec('RESET ROLE');await db.query("UPDATE org_staff SET expires_at=now()-interval '1 second' WHERE user_id=$1",[staff]);
  await actor(db,staff);await reject42501(db,'SELECT get_postpaid_access_profile($1)',[org]);expect(await crm(db)).toBe(false);
 });
 it('does not disclose an organization grant to a foreign user or authorize a foreign tenant',async()=>{
  await agreement(db);await grant(db);await actor(db,foreign);await reject42501(db,'SELECT get_postpaid_access_profile($1)',[org]);expect(await crm(db)).toBe(false);
  await actor(db,owner);expect(await crm(db,'sales.read',id(999))).toBe(false);
 });
 it('retains account-revocation fences even for an owner with the grant',async()=>{
  await agreement(db);await grant(db);await db.exec('RESET ROLE');await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[owner]);
  await actor(db,owner);await reject42501(db,'SELECT get_postpaid_access_profile($1)',[org]);expect(await crm(db)).toBe(false);
 });
 it('prevents an ordinary organization owner from self-granting using the real protected-column trigger',async()=>{
  // Use a non-installer session identity; postgres is an intentional trusted branch.
  await db.exec('RESET ROLE;GRANT authenticated TO sandbox_exec;SET SESSION AUTHORIZATION sandbox_exec');
  await actor(db,owner);await reject42501(db,"UPDATE organizations SET custom_enabled_categories=ARRAY['platform_all_features'] WHERE id=$1",[org]);
  await db.exec('RESET SESSION AUTHORIZATION;RESET ROLE');expect((await row(db,'SELECT custom_enabled_categories FROM organizations WHERE id=$1',[org])).custom_enabled_categories??[]).toEqual([]);
 });
 it('preserves paid-confirmation behavior separately for an organization without the administrative grant',async()=>{
  await agreement(db);await db.exec('RESET ROLE');await db.query("INSERT INTO postpaid_feature_confirmations(organization_id,feature,notified_at,confirmed_at,evidence,recorded_by)VALUES($1,'crm',now()-interval '2 seconds',now()-interval '1 second','Synthetic separately confirmed paid addon',$2)",[org,owner]);
  await actor(db,owner);expect((await profile(db)).features.crm).toBe(true);expect((await profile(db)).entitlements.all_platform_features).toBe(false);expect(await crm(db)).toBe(true);
 });
});
