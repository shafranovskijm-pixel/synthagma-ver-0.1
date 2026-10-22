// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createUcGroupEducationFixture } from '../../functions/_shared/uc-group-education-facts.fixture';

const folder='docs/releases/sintagma-production/uc-group-education-facts-20261019/';
const original=JSON.parse(readFileSync(folder+'mode48-integration-witness.json','utf8'));
const witness=JSON.parse(readFileSync(folder+'counter51-integration-witness.json','utf8'));
it('installs exact native-witness51 ABI/body/ACL registry while preserving original47 and48 witnesses',async()=>{
 expect(original.preservedBefore47).toHaveLength(47);expect(original.expectedAfter48).toHaveLength(48);
 expect(witness.expectedPortableCatalog51).toHaveLength(51);
 expect(new Set(witness.expectedPortableCatalog51.map((f:any)=>f.signature)).size).toBe(51);
 const db=await createUcGroupEducationFixture(true);
 try{
  await db.exec('RESET ROLE');
  const actual=(await db.query(`SELECT p.oid::regprocedure::text signature,l.lanname language,md5(pg_get_functiondef(p.oid))definition_md5,
   pg_get_userbyid(p.proowner)owner,p.proacl::text acl,p.provolatile volatility,p.prosecdef security_definer,p.proisstrict strict,
   p.proleakproof leakproof,p.proparallel parallel,p.procost::float8 cost,p.prorows::float8 rows,p.prokind kind,p.proconfig configuration,
   pg_get_function_identity_arguments(p.oid)identity_arguments,pg_get_function_arguments(p.oid)arguments,pg_get_function_result(p.oid)result,
   p.proretset set_returning,p.prorettype::regtype::text return_type
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE n.nspname='public'AND p.proname=ANY($1::text[])ORDER BY p.oid::regprocedure::text`,[witness.expectedPortableCatalog51.map((f:any)=>f.signature.split('(')[0])])).rows;
  expect(actual).toEqual(witness.expectedPortableCatalog51);
  for(const signature of witness.ownerOnlyHelpers){
   const helper=actual.find((f:any)=>f.signature===signature);expect(helper.owner).toBe('postgres');expect(helper.acl).toBe('{postgres=X/postgres}');expect(helper.security_definer).toBe(true);
  }
  const actor=actual.find((f:any)=>f.signature==='uc_group_education_actor_facts(uuid,uuid,uuid,boolean)');
  expect(actor.return_type).toBe('record');expect(actor.set_returning).toBe(true);
  const structural=(await db.query(`SELECT conname name,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.uc_group_education_requests'::regclass AND conname=ANY($1::text[])ORDER BY conname`,[witness.structureDelta.addedChecks.map((c:any)=>c.object_name)])).rows;
  expect(structural).toEqual(witness.structureDelta.addedChecks.map((c:any)=>({name:c.object_name,definition:c.definition})));
  expect((await db.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.uc_group_education_requests'::regclass AND tgname='aaa_uc013_budget_ticket_guard' AND tgenabled='O'`)).rows[0].n).toBe(1);
  const queries=['SELECT uc_group_education_budget_counter(NULL::uuid)','SELECT uc_group_education_budget_ticket_guard()','SELECT uc_group_education_compact_budget_tickets()'];
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('RESET ROLE;SET ROLE '+role);
   for(const mode of [false,true,null])await expect(db.query('SELECT * FROM uc_group_education_actor_facts($1,$2,$3,$4)',[null,null,null,mode])).rejects.toMatchObject({code:'42501'});
   for(const query of queries)await expect(db.query(query)).rejects.toMatchObject({code:'42501'});
  }
 }finally{await db.exec('RESET ROLE');await db.close();}
},60000);
