import{describe,it,expect}from'vitest';
import{archiveUuid,archiveSource,archiveApplyArgs}from'../contract.ts';
import{source,hash}from'./fixtures.ts';
const historicalRoot='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
describe('archive PostgreSQL UUID identity boundary',()=>{
 it('accepts the actual historical administrative UUID in actor and source references',()=>{
  expect(archiveUuid.parse(historicalRoot)).toBe(historicalRoot);
  expect(archiveSource.parse({...source(),document_id:historicalRoot,version_id:historicalRoot})).toMatchObject({document_id:historicalRoot});
  expect(archiveApplyArgs.parse({organization_id:historicalRoot,scope:{kind:'organization'},request_id:historicalRoot,case_id:null,expected_revision:0,action:{kind:'open_case',title:'Synthetic archive case',opened_on:'2026-10-23'}}).organization_id).toBe(historicalRoot);
 });
 it.each(['{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeez','aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee',' aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])('rejects malformed PostgreSQL identity %s',value=>{expect(archiveUuid.safeParse(value).success).toBe(false);});
 it('keeps source references closed and validates source CAS independently of identity',()=>{
  expect(archiveSource.safeParse({kind:'registry_record',record_id:historicalRoot,revision:1,state_hash:hash,other:true}).success).toBe(false);
  expect(archiveSource.safeParse({kind:'registry_record',record_id:historicalRoot,revision:1,state_hash:'x'.repeat(64)}).success).toBe(false);
 });
});
