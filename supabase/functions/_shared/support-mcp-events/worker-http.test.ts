import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { base64Encode, createSecretCrypto } from './crypto.ts';
import { createWorkerHttpHandler, loadRuntimeConfig, signWake, type RuntimeConfig } from './worker-http.ts';
import { CallbackTransportError, type PinnedHttpsTransport } from './pinned-https.ts';
import type { RpcClient } from './delivery.ts';

const clock=1700000000000;
const timestamp=String(clock/1000);
const nonce='11111111-1111-4111-8111-111111111111';
const token=base64Encode(new Uint8Array(32).fill(13));
const key=base64Encode(new Uint8Array(32).fill(9));
const service='synthetic-service-key-never-queued';
const config:RuntimeConfig={enabled:false,encryptionKey:{kid:'vault-v1',key_base64:key},workerToken:token};
function fixture(override:Partial<RuntimeConfig>={}){
  const calls:{name:string;args:Record<string,unknown>}[]=[];let consume=true,ready=true,probes=0;
  const client:RpcClient={async rpc(name,args){calls.push({name,args});return {data:name.endsWith('_runtime_config')?{...config,...override}:name.endsWith('_consume_wake_nonce')?consume:name.endsWith('_claim')?[]:null,error:null};}};
  const transport:PinnedHttpsTransport={assertReady(){if(!ready)throw new CallbackTransportError('runtime_not_proven');},async post(){throw new Error('test must not deliver');},async probeRuntime(){probes++;return{status:200};}};
  const handler=createWorkerHttpHandler({client,env:n=>n==='SUPABASE_SERVICE_ROLE_KEY'?service:undefined,transport,now:()=>clock});
  return{handler,calls,denyReplay:()=>{consume=false;},notReady:()=>{ready=false;},probeCount:()=>probes};
}
async function wake(headers:Record<string,string>={},body='{}',query=''){
  const ts=headers['x-sintagma-events-timestamp']??timestamp,n=headers['x-sintagma-events-nonce']??nonce;
  return new Request('https://project.supabase.co/functions/v1/support-event-delivery'+query,{method:'POST',headers:{'content-type':'application/json','x-sintagma-events-timestamp':ts,'x-sintagma-events-nonce':n,'x-sintagma-events-signature':await signWake(ts,n,token),...headers},body});
}
test('wake HMAC independently matches exact prefix, timestamp and nonce bytes',async()=>{
  const expected=createHmac('sha256',Buffer.from(token,'base64')).update(`sintagma-support-events-wake-v1\n${timestamp}\n${nonce}`).digest('hex');assert.equal(await signWake(timestamp,nonce,token),expected);
});
test('Vault loader is service-RPC only and AES kid is derived rather than copied from Vault metadata',async()=>{
  const f=fixture();const loaded=await loadRuntimeConfig({async rpc(name,args){assert.equal(name,'sintagma_support_event_runtime_config');assert.deepEqual(args,{});return{data:config,error:null};}},()=>undefined);
  assert.equal(loaded.enabled,false);assert.notEqual((await createSecretCrypto(loaded.encryptionKey.key_base64)).kid,'vault-v1');assert.equal(f.calls.length,0);
});
test('explicit env pair supports tests without mixing partial secrets from Vault',async()=>{
  let called=0;const client:RpcClient={async rpc(){called++;return{data:config,error:null};}};
  const loaded=await loadRuntimeConfig(client,n=>n==='MCP_EVENTS_ENCRYPTION_KEY'?key:n==='MCP_EVENTS_WORKER_TOKEN'?token:undefined);assert.equal(loaded.enabled,false);assert.equal(called,0);
  await assert.rejects(loadRuntimeConfig(client,n=>n==='MCP_EVENTS_ENCRYPTION_KEY'?key:undefined));assert.equal(called,0);
});
test('valid disabled wake never consumes a delivery nonce or claims jobs',async()=>{
  const f=fixture();const res=await f.handler(await wake());assert.equal(res.status,202);assert.deepEqual(await res.json(),{enabled:false,delivered:false});assert.deepEqual(f.calls.map(x=>x.name),['sintagma_support_event_runtime_config']);
});
test('replayed nonce is refused before draining',async()=>{
  const f=fixture({enabled:true});f.denyReplay();const res=await f.handler(await wake());assert.equal(res.status,409);assert.ok(!f.calls.some(x=>x.name.endsWith('_claim')));
});
for(const delta of [-61,6])test('wake timestamp outside TTL '+delta+' is rejected before reading Vault',async()=>{
  const f=fixture();const res=await f.handler(await wake({'x-sintagma-events-timestamp':String(clock/1000+delta)}));assert.equal(res.status,401);assert.equal(f.calls.length,0);
});
test('invalid HMAC does not consume a nonce or expose stored secrets',async()=>{
  const f=fixture();const res=await f.handler(await wake({'x-sintagma-events-signature':'0'.repeat(64)}));assert.equal(res.status,401);assert.equal(f.calls.length,1);const body=await res.text();assert.ok(!body.includes(token));assert.ok(!body.includes(key));
});
test('wake body is exactly empty JSON and bounded before RPC',async()=>{
  const f=fixture();for(const body of ['{ }','{} ','{"probe":true}','x'.repeat(10000)])assert.equal((await f.handler(await wake({},body))).status,400);assert.equal(f.calls.length,0);
});
test('enabled worker still fails closed before claim on unproven runtime',async()=>{
  const f=fixture({enabled:true});f.notReady();const res=await f.handler(await wake());assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'runtime_not_proven'});assert.ok(!f.calls.some(x=>x.name.endsWith('_claim')));
});
test('probe requires exact service credential and never accepts wake authentication',async()=>{
  const f=fixture();assert.equal((await f.handler(await wake({},'{}','?probe=pinning'))).status,401);assert.equal(f.calls.length,0);assert.equal(f.probeCount(),0);
});
test('service-only disabled probe invokes only fixed read-only transport and never activates delivery',async()=>{
  const f=fixture();const res=await f.handler(new Request('https://project.supabase.co/functions/v1/support-event-delivery?probe=pinning',{method:'POST',headers:{authorization:'Bearer '+service,'content-type':'application/json'},body:'{}'}));assert.equal(res.status,200);assert.equal(f.probeCount(),1);assert.deepEqual(f.calls.map(x=>x.name),['sintagma_support_event_runtime_config']);assert.equal((await res.json()).readinessMarker,false);
});
test('probe rejects enabled delivery and caller-selected destination parameters',async()=>{
  const f=fixture({enabled:true});for(const query of ['?probe=pinning','?probe=pinning&url=https://127.0.0.1']){
    const res=await f.handler(new Request('https://project.supabase.co/functions/v1/support-event-delivery'+query,{method:'POST',headers:{authorization:'Bearer '+service,'content-type':'application/json'},body:'{}'}));assert.ok([400,409].includes(res.status));
  }assert.equal(f.probeCount(),0);
});
