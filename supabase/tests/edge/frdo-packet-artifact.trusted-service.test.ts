import {describe,it,expect,vi,beforeAll,afterAll}from'vitest';
import {webcrypto}from'node:crypto';
import {createTrustedFrdoService,sourceDescriptorSchema,type TrustedFrdoPorts}from'../../functions/frdo-packet-artifact/trustedService';
import {input}from'../../../src/lib/frdoFoundation/__tests__/fixtures';
import {mapFrozenProjections}from'../../../src/lib/frdoFoundation/mapper';
import {actor,org}from'../../../src/lib/educationIssuance/__tests__/fixtures';
import {sha256}from'../../../src/lib/frdoFoundation/hash';

beforeAll(()=>vi.stubGlobal('crypto',webcrypto));afterAll(()=>vi.unstubAllGlobals());
const request='22222222-2222-4222-8222-222222222222';
const guard={assertCurrent:()=>{}};
function ports(){return{originalUser:vi.fn(async()=>({id:actor})),originalRpc:vi.fn(),serviceRpc:vi.fn(),readSource:vi.fn(),donor:vi.fn(),xml:{} as TrustedFrdoPorts['xml'],uploadCandidate:vi.fn(),readCandidate:vi.fn(),now:()=>Date.parse('2026-10-23T00:00:00Z')}satisfies TrustedFrdoPorts;}
const source={kind:'org_document_version',document_id:'33333333-3333-4333-8333-333333333333',version_id:'44444444-4444-4444-8444-444444444444',content_hash:'a'.repeat(64)};
const descriptor={source,bucket:'org-documents',path:`${org}/versions/${source.document_id}/file.pdf`,object_id:'55555555-5555-4555-8555-555555555555',updated_at:'2026-10-23T00:00:00Z',byte_size:3,expected_sha256:'a'.repeat(64)};
async function supplementCommand(){const fixture=await input(),mapped=await mapFrozenProjections(fixture,guard);return{schema_version:1,abi_revision:'uc020-persisted-v5',organization_id:org,scope:fixture.context.scope,request_id:request,action:{kind:'save_supplement',input:{record:mapped.rows[0].record,expected_revision:0,fields:fixture.items[0].supplement!.fields,evidence:[{source,byte_sha256:'a'.repeat(64),byte_size:3}],review_note:'Только техническая проверка'}}};}

describe('trusted FRDO original-JWT service boundary',()=>{
 it('rechecks actual database rights after preview mapping and refuses a late revocation before projecting rows',async()=>{
  const p=ports(),service=createTrustedFrdoService(p),fixture=await input();p.originalRpc.mockResolvedValueOnce({input:fixture,source_descriptors:[descriptor]}).mockRejectedValueOnce(new Error('actual DB ACCESS_DENIED'));
  await expect(service.preview({schema_version:1,abi_revision:'uc020-persisted-v5',organization_id:org,scope:fixture.context.scope,query:{kind:'preview',selection:{stream:fixture.context.stream,record_ids:[fixture.items[0].record.official.id],template:fixture.context.template},issuer_review:{regime:'unconfirmed',evidence:null,review_note:null}}},guard)).rejects.toThrow('actual DB ACCESS_DENIED');expect(p.originalRpc).toHaveBeenCalledTimes(2);expect(p.readSource).not.toHaveBeenCalled();expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('rejects caller actor or service-only metadata before any user/service operation',async()=>{
  const p=ports(),service=createTrustedFrdoService(p);
  await expect(service.evidenced({verified_actor_id:actor},guard)).rejects.toThrow();
  expect(p.originalUser).not.toHaveBeenCalled();expect(p.originalRpc).not.toHaveBeenCalled();expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('does not turn unconfirmed/joint issuer input into an ordinary issuer',async()=>{
  const p=ports(),service=createTrustedFrdoService(p);
  await expect(service.freeze({schema_version:1,abi_revision:'uc020-persisted-v5',organization_id:org,scope:{kind:'organization'},request_id:request,action:{kind:'freeze_preview',selection:{stream:'dpo',record_ids:[source.document_id],template:{}},expected_preview_hash:'a'.repeat(64),issuer_review:{regime:'unconfirmed',evidence:null,review_note:null}}},guard)).rejects.toThrow();
  expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it.each(['https://example.test/a.pdf','../a.pdf','a/../b.pdf','a//b.pdf','a\\b.pdf','a?token=x'])('rejects non-private source path %s',path=>{
  expect(sourceDescriptorSchema.safeParse({...descriptor,path}).success).toBe(false);
 });
 it('rejects packet artifacts as evidence instead of recursively trusting the newly extended registry',()=>{
  expect(sourceDescriptorSchema.safeParse({...descriptor,source:{kind:'frdo_packet_artifact',packet_id:request}}).success).toBe(false);
 });
 it('accepts an exact private descriptor but no extra actor or byte-proof fields',()=>{
  expect(sourceDescriptorSchema.safeParse(descriptor).success).toBe(true);
  expect(sourceDescriptorSchema.safeParse({...descriptor,actor_id:actor}).success).toBe(false);
 });
 it('aborts before auth when the captured actor/scope guard is already revoked',async()=>{
  const p=ports(),service=createTrustedFrdoService(p);
  const command=await supplementCommand();
  await expect(service.evidenced(command,{assertCurrent(){throw new Error('scope revoked');}})).rejects.toThrow();
  expect(p.originalUser).not.toHaveBeenCalled();expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('hashes actual source bytes and rejects a matching metadata size with the wrong content',async()=>{
  const p=ports(),service=createTrustedFrdoService(p),command=await supplementCommand();
  p.originalRpc.mockResolvedValue({phase:'pending',receipt:null,source_descriptors:[descriptor]});p.readSource.mockResolvedValue(new Uint8Array([1,2,3]));
  await expect(service.evidenced(command,guard)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(p.readSource).toHaveBeenCalledTimes(1);expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('does not call the service commit after the verified original actor changes during file hashing',async()=>{
  const p=ports(),service=createTrustedFrdoService(p),command=await supplementCommand(),bytes=new Uint8Array([1,2,3]);
  p.originalRpc.mockResolvedValue({phase:'pending',receipt:null,source_descriptors:[{...descriptor,expected_sha256:await sha256(bytes)}]});p.readSource.mockResolvedValue(bytes);
  p.originalUser.mockResolvedValueOnce({id:actor}).mockResolvedValueOnce({id:request});
  await expect(service.evidenced(command,guard)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('does not silently deduplicate conflicting exact source descriptors',async()=>{
  const p=ports(),service=createTrustedFrdoService(p),command=await supplementCommand(),bytes=new Uint8Array([1,2,3]),proof={...descriptor,expected_sha256:await sha256(bytes)};
  p.originalRpc.mockResolvedValue({phase:'pending',receipt:null,source_descriptors:[proof,{...proof,object_id:request}]});p.readSource.mockResolvedValue(bytes);
  await expect(service.evidenced(command,guard)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(p.serviceRpc).not.toHaveBeenCalled();
 });
 it('guards a completed source GET before digest or any service operation',async()=>{
  const p=ports(),service=createTrustedFrdoService(p),command=await supplementCommand();let current=true;
  p.originalRpc.mockResolvedValue({phase:'pending',receipt:null,source_descriptors:[descriptor]});p.readSource.mockImplementation(async()=>{current=false;return new Uint8Array([1,2,3]);});
  await expect(service.evidenced(command,{assertCurrent(){if(!current)throw new Error('scope revoked');}})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(p.readSource).toHaveBeenCalledTimes(1);expect(p.serviceRpc).not.toHaveBeenCalled();
 });
});
