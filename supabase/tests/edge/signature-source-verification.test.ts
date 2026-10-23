import { describe, expect, it, vi } from 'vitest';
import { verifySignatureSource, canonicalSignatureStorageReader, type SignatureSourceDependencies } from '../../functions/signature-source-verification/worker.ts';
import { trustedSignatureFileProofSchema } from '../../functions/signature-source-verification/contract.ts';
import { createSignatureSourceHttpHandler } from '../../functions/signature-source-verification/http.ts';

// Synthetic source-only transport harness. It does not establish ordinary-role
// permission parity, a deployed service facade, or genuine Storage/DB attestation.
const actor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const org='11111111-2222-3333-4444-555555555555';
const signature='22222222-2222-3333-4444-555555555555';
const requestId='33333333-2222-3333-4444-555555555555';
const proofId='44444444-2222-3333-4444-555555555555';
const objectId='55555555-2222-3333-4444-555555555555';
const stamp='2026-10-22T18:00:00.000Z';
const literal=new TextEncoder().encode('Синтетический неизменяемый исходник договора');
const source={organization_id:org,signature_id:signature,chosen_party:'sender' as const,
 document_revision_id:null,document_html_sha256:'a'.repeat(64),purpose:'source' as const,bucket:'external-contracts' as const,path:org+'/fixture.pdf'};
const object={object_id:objectId,bucket:source.bucket,path:source.path,updated_at:stamp,metadata_sha256:'b'.repeat(64),reported_size:literal.byteLength,reported_mime:'application/pdf'};
const request={version:1,action:'verify_source',verification_request_id:requestId,
 address:{kind:'authenticated_signature',organization_id:org,signature_id:signature,chosen_party:'sender'},expected_document_revision_id:null,document_html_sha256:source.document_html_sha256};

function harness(headers:Record<string,string>={}){
 const observeOriginalActor=vi.fn<SignatureSourceDependencies['observeOriginalActor']>(async()=>actor);
 const readCanonicalObject=vi.fn<SignatureSourceDependencies['readCanonicalObject']>(async()=>new Response(new Uint8Array(literal),{status:200,
  headers:{'content-type':'application/pdf','content-length':String(literal.byteLength),...headers}}));
 const service=vi.fn<SignatureSourceDependencies['service']>(async input=>{
  expect(input.p_observed_actor_user_id).toBe(actor);
  if(input.p_action.action==='file_context')return {version:1,ok:true,kind:'file_context',source,object};
  if(input.p_original_proof===null)return {version:1,ok:false,code:'SOURCE_UNAVAILABLE'};
  const proof=trustedSignatureFileProofSchema.parse(input.p_original_proof);
  return {version:1,ok:true,kind:'file_verified',verification_request_id:requestId,verification_record_id:proofId,
   outcome:'applied',verified_at:stamp,source:proof.source,object:proof.object_after,file:proof.file};
 });
 return {observeOriginalActor,readCanonicalObject,service};
}
describe('UC022 private source byte transport authoring',()=>{
 it('binds exact decoded bytes to before/after canonical object identity without exposing a source path',async()=>{
  const deps=harness();const value=await verifySignatureSource(request,deps);
  expect(value).toMatchObject({kind:'source_verified',outcome:'applied',byte_size:literal.byteLength,verification_record_id:proofId});
  expect(value).not.toHaveProperty('source');expect(value).not.toHaveProperty('path');
  expect(deps.readCanonicalObject).toHaveBeenCalledTimes(1);
  const applied=deps.service.mock.calls.find(([input])=>input.p_original_proof!==null)![0].p_original_proof!;
  expect(applied.object_before).toEqual(object);expect(applied.object_after).toEqual(object);
  expect(applied.file.bytes).toBe(literal.byteLength);expect(applied.file.sha256).toBe(value.byte_sha256);
 });
 it('accepts decoded gzip body with compressed wire length while preserving actual metadata-size proof',async()=>{
  const deps=harness({'content-encoding':'gzip','content-length':'19'});
  const value=await verifySignatureSource(request,deps);
  expect(value.byte_size).toBe(literal.byteLength);
  const proof=deps.service.mock.calls.find(([input])=>input.p_original_proof!==null)![0].p_original_proof!;
  expect(proof.file.bytes).toBe(object.reported_size);
 });
 it('refuses an identity body whose Content-Length differs before creating any receipt',async()=>{
  const deps=harness({'content-length':'19'});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(deps.service.mock.calls.filter(([input])=>input.p_original_proof!==null)).toHaveLength(0);
 });
 it('refuses a compressed decoded body that contradicts the actual object size',async()=>{
  const deps=harness({'content-encoding':'br','content-length':'19'});
  deps.service.mockImplementation(async input=>input.p_action.action==='file_context'
   ? {version:1,ok:true,kind:'file_context',source,object:{...object,reported_size:literal.byteLength+1}}
   : {version:1,ok:false,code:'SOURCE_UNAVAILABLE'});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(deps.service.mock.calls.filter(([input])=>input.p_original_proof!==null)).toHaveLength(0);
 });
 it('refuses an unsupported content coding without treating wire bytes as an original',async()=>{
  const deps=harness({'content-encoding':'unknown-fixture'});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  expect(deps.service.mock.calls.filter(([input])=>input.p_original_proof!==null)).toHaveLength(0);
 });
});

describe('current source authority and immutable recovery',()=>{
 it('refuses caller supplied actor, proof or Storage locator before any dependency',async()=>{
  for(const extra of [{actor_user_id:actor},{proof:{file:'fabricated'}},{storage_url:'https://attacker.invalid/file'}]){
   const deps=harness();
   await expect(verifySignatureSource({...request,...extra},deps)).rejects.toMatchObject({code:'INVALID_INPUT'});
   expect(deps.observeOriginalActor).not.toHaveBeenCalled();expect(deps.service).not.toHaveBeenCalled();
  }
 });
 it('refuses invitation-only verification on the authenticated source route',async()=>{
  const deps=harness();
  await expect(verifySignatureSource({...request,address:{kind:'invitation',token:'synthetic-secret-token'}},deps)).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(deps.service).not.toHaveBeenCalled();
 });
 it('denies an actor change before private bytes are requested',async()=>{
  const deps=harness();deps.observeOriginalActor.mockResolvedValueOnce(actor).mockResolvedValueOnce('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee');
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(deps.readCanonicalObject).not.toHaveBeenCalled();expect(deps.service.mock.calls.some(([v])=>v.p_original_proof!==null)).toBe(false);
 });
 it('refuses a server context from another organization without following its locator',async()=>{
  const deps=harness();deps.service.mockImplementation(async input=>input.p_action.action==='file_context'
   ? {version:1,ok:true,kind:'file_context',source:{...source,organization_id:'99999999-2222-3333-4444-555555555555'},object}
   : {version:1,ok:false,code:'SOURCE_UNAVAILABLE'});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(deps.readCanonicalObject).not.toHaveBeenCalled();
 });
 it('does not attest if the canonical Storage object changed after reading its bytes',async()=>{
  const deps=harness();let reads=0;
  deps.service.mockImplementation(async input=>input.p_action.action==='file_context'
   ? {version:1,ok:true,kind:'file_context',source,object:++reads===1?object:{...object,metadata_sha256:'c'.repeat(64)}}
   : {version:1,ok:false,code:'SOURCE_UNAVAILABLE'});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  expect(deps.readCanonicalObject).toHaveBeenCalledOnce();expect(deps.service.mock.calls.some(([v])=>v.p_original_proof!==null)).toBe(false);
 });
 it('keeps the captured selector when the caller mutates its original object during authentication',async()=>{
  const deps=harness();const mutable=structuredClone(request);
  deps.observeOriginalActor.mockImplementationOnce(async()=>{mutable.address.organization_id='99999999-2222-3333-4444-555555555555';mutable.verification_request_id=proofId;return actor;});
  const result=await verifySignatureSource(mutable,deps);
  expect(result.organization_id).toBe(org);expect(result.verification_request_id).toBe(requestId);
  for(const [input]of deps.service.mock.calls)expect(input.p_action.address).toEqual(request.address);
 });
 it('returns the same stored technical receipt on recovery without downloading or regenerating bytes',async()=>{
  const deps=harness();deps.service.mockResolvedValue({version:1,ok:true,kind:'file_verified',verification_request_id:requestId,verification_record_id:proofId,outcome:'replayed',verified_at:stamp,source,object,file:{bucket:source.bucket,path:source.path,sha256:'d'.repeat(64),bytes:literal.byteLength,mime:'application/pdf'}});
  const result=await verifySignatureSource(request,deps);
  expect(result).toMatchObject({outcome:'replayed',verified_at:stamp,verification_record_id:proofId,byte_sha256:'d'.repeat(64)});
  expect(deps.readCanonicalObject).not.toHaveBeenCalled();expect(deps.service).toHaveBeenCalledOnce();
  expect(deps.service.mock.calls[0][0].p_original_proof).toBeNull();
 });
 it('refuses a recovered receipt for a different request',async()=>{
  const deps=harness();deps.service.mockResolvedValue({version:1,ok:true,kind:'file_verified',verification_request_id:proofId,verification_record_id:proofId,outcome:'replayed',verified_at:stamp,source,object,file:{bucket:source.bucket,path:source.path,sha256:'d'.repeat(64),bytes:literal.byteLength,mime:'application/pdf'}});
  await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(deps.readCanonicalObject).not.toHaveBeenCalled();
 });
 it('cancels a stalled byte stream on scope abort and never attests a partial body',async()=>{
  const deps=harness(),controller=new AbortController();let reading=false;const cancel=vi.fn();
  deps.readCanonicalObject.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({pull(){reading=true;return new Promise(()=>{});},cancel},{highWaterMark:0}),{headers:{'content-type':'application/pdf'}}));
  const pending=verifySignatureSource(request,deps,controller.signal);const rejected=expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await vi.waitFor(()=>expect(reading).toBe(true));controller.abort();await rejected;
  await vi.waitFor(()=>expect(cancel).toHaveBeenCalledOnce());expect(deps.service.mock.calls.some(([v])=>v.p_original_proof!==null)).toBe(false);
 });
 it('refuses an oversized declared body and a redirected body without recording a proof',async()=>{
  const redirected=new Response(literal,{headers:{'content-type':'application/pdf'}});Object.defineProperty(redirected,'redirected',{value:true});
  const responses=[{response:new Response(literal,{headers:{'content-type':'application/pdf','content-length':String(20*1024*1024+1)}}),code:'LIMIT_EXCEEDED'},{response:redirected,code:'DEPENDENCY_UNAVAILABLE'}];
  for(const {response,code}of responses){
   const deps=harness();deps.readCanonicalObject.mockResolvedValue(response);
   await expect(verifySignatureSource(request,deps)).rejects.toMatchObject({code});expect(deps.service.mock.calls.some(([v])=>v.p_original_proof!==null)).toBe(false);
  }
 });
 it('reads only the configured own origin and canonical key with no redirect or credentials',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(literal));const reader=canonicalSignatureStorageReader('https://own.invalid','synthetic-service-key',fetcher);const signal=new AbortController().signal;
  await reader(source,signal);
  expect(fetcher).toHaveBeenCalledWith('https://own.invalid/storage/v1/object/authenticated/external-contracts/'+org+'/fixture.pdf',expect.objectContaining({method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal,headers:{Authorization:'Bearer synthetic-service-key',apikey:'synthetic-service-key'}}));
  await expect(reader({...source,path:'https://attacker.invalid/file'},signal)).rejects.toMatchObject({code:'SOURCE_UNAVAILABLE'});expect(fetcher).toHaveBeenCalledOnce();
 });
 it('rejects configured URL credentials, paths and query strings before any network request',()=>{
  for(const url of ['http://own.invalid','https://name:password@own.invalid','https://own.invalid/storage','https://own.invalid?secret=value'])expect(()=>canonicalSignatureStorageReader(url,'synthetic-key')).toThrow();
 });
});

describe('original JWT HTTP boundary',()=>{
 const post=(body:unknown,authorization:string|null='Bearer original-captured-jwt')=>new Request('https://edge.invalid/source',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(body)});
 it('answers OPTIONS without constructing credentials or reading a body',async()=>{
  const factory=vi.fn();const response=await createSignatureSourceHttpHandler(factory)(new Request('https://edge.invalid/source',{method:'OPTIONS'}));
  expect(response.status).toBe(204);expect(response.headers.get('cache-control')).toBe('no-store');expect(factory).not.toHaveBeenCalled();
 });
 it('requires the original bearer and never accepts an identity or token from JSON',async()=>{
  const factory=vi.fn(()=>harness());const handler=createSignatureSourceHttpHandler(factory);
  for(const header of [null,'Basic original-captured-jwt','Bearer a b']){const response=await handler(post({...request,authorization:'Bearer forged'},header));expect(response.status).toBe(401);expect(await response.json()).toEqual({version:1,ok:false,code:'ACCESS_DENIED'});}
  expect(factory).not.toHaveBeenCalled();
 });
 it('passes exactly the captured bearer to its dependencies and returns only the closed result',async()=>{
  const factory=vi.fn(()=>harness());const response=await createSignatureSourceHttpHandler(factory)(post(request));
  expect(response.status).toBe(200);expect(factory).toHaveBeenCalledExactlyOnceWith('original-captured-jwt');
  const body=await response.json();expect(body).toMatchObject({ok:true,kind:'source_verified',organization_id:org,verification_request_id:requestId});expect(body).not.toHaveProperty('path');expect(JSON.stringify(body)).not.toContain('original-captured-jwt');
 });
 it('returns an authentication failure without private reads when auth.getUser no longer verifies the original token',async()=>{
  const deps=harness();deps.observeOriginalActor.mockResolvedValue(null);
  const response=await createSignatureSourceHttpHandler(()=>deps)(post(request));expect(response.status).toBe(401);expect(deps.service).not.toHaveBeenCalled();expect(deps.readCanonicalObject).not.toHaveBeenCalled();
 });
 it('rejects extra proof fields and over-budget input before any identity or database operation',async()=>{
  const deps=harness();const handler=createSignatureSourceHttpHandler(()=>deps);
  const forged=await handler(post({...request,p_original_proof:{assurance:'trusted_service_reread'}}));expect(forged.status).toBe(400);
  const oversized=await handler(post({...request,extra:'x'.repeat(17000)}));expect(oversized.status).toBe(400);
  expect(deps.observeOriginalActor).not.toHaveBeenCalled();expect(deps.service).not.toHaveBeenCalled();
 });
 it('does not include upstream errors, JWTs, invitation links or service secrets in an error response',async()=>{
  const handler=createSignatureSourceHttpHandler(()=>{throw new Error('original-captured-jwt synthetic-service-secret /sign/synthetic-secret-token');});
  const response=await handler(post(request));expect(response.status).toBe(503);expect(await response.json()).toEqual({version:1,ok:false,code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('bounds a stalled JSON body, cancels its stream and never constructs service credentials',async()=>{
  vi.useFakeTimers();const cancel=vi.fn(),factory=vi.fn(()=>harness());
  try{
   const stream=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel});
   const input=new Request('https://edge.invalid/source',{method:'POST',headers:{authorization:'Bearer original-captured-jwt'},body:stream,duplex:'half'}as RequestInit);
   const pending=createSignatureSourceHttpHandler(factory)(input);await vi.advanceTimersByTimeAsync(10001);const response=await pending;
   expect(response.status).toBe(503);expect(cancel).toHaveBeenCalledOnce();expect(factory).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('refuses unsupported HTTP methods without constructing dependencies',async()=>{
  const factory=vi.fn(()=>harness());const response=await createSignatureSourceHttpHandler(factory)(new Request('https://edge.invalid/source'));
  expect(response.status).toBe(405);expect(factory).not.toHaveBeenCalled();
 });
});
