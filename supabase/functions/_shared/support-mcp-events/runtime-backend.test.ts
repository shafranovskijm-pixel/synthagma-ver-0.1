import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeBackend, type RuntimeBackendOptions } from './runtime-backend.ts';
import { EventProtocolError } from './protocol.ts';
import { secretAad } from './crypto.ts';
import type { PinnedHttpsTransport } from './pinned-https.ts';

const identity = { user_id: '11111111-1111-4111-8111-111111111111', client_id: '22222222-2222-4222-8222-222222222222', session_id: '33333333-3333-4333-8333-333333333333' };
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)));
const secret = 'whsec_'+btoa(String.fromCharCode(...new Uint8Array(32).fill(13)));
const readyTransport: PinnedHttpsTransport = { assertReady() {}, async post() { throw new Error('not_used'); } };
function fixture(overrides: Partial<RuntimeBackendOptions> = {}) {
  const calls: {name: string; args: unknown}[] = [];
  const options: RuntimeBackendOptions = {
    env: () => undefined, transport: readyTransport,
    serviceClient: () => ({ async rpc(name,args) { calls.push({name,args}); return {data:{enabled:true,configured:true,workerUrl:null},error:null}; } }),
    userClient: () => ({ auth: { async getUser() { return {data:{user:{id:identity.user_id}},error:null}; } }, async rpc() { return {data:identity,error:null}; } }),
    loadConfig: async () => ({ enabled:true,encryptionKey:{key_base64:key},workerToken:key }),
    ...overrides,
  };
  return {backend:createRuntimeBackend(options),calls,options};
}
const isCode = (code: EventProtocolError['code']) => (error:unknown) => error instanceof EventProtocolError && error.code===code && error.message===code;
test('readiness requires configured enabled state from service RPC',async()=>{
  const f=fixture();assert.equal(await f.backend.isReady(),true);assert.deepEqual(f.calls,[{name:'sintagma_support_event_runtime_readiness',args:{}}]);
});
test('runtime pinning gate blocks discovery before any readiness query',async()=>{
  const f=fixture({transport:{...readyTransport,assertReady(){throw new Error('runtime_not_proven');}}});
  assert.equal(await f.backend.isReady(),false);assert.equal(f.calls.length,0);
});
for(const value of [{enabled:false,configured:true},{enabled:true,configured:false},{enabled:true,configured:true,unexpected:'secret'},{enabled:'true',configured:true}]) {
  test(`readiness fails closed ${JSON.stringify(value)}`,async()=>{
    const f=fixture({serviceClient:()=>({async rpc(){return {data:value,error:null};}})});assert.equal(await f.backend.isReady(),false);
  });
}
test('real getUser and authorize use the original bearer and the same user client',async()=>{
  const calls:string[]=[];const token='original-oauth-bearer';
  const f=fixture({userClient:bearer=>{calls.push('factory:'+bearer);return {auth:{async getUser(value){calls.push('getUser:'+value);return {data:{user:{id:identity.user_id}},error:null};}},async rpc(name,args){calls.push(name+':'+JSON.stringify(args));return {data:identity,error:null};}};}});
  assert.deepEqual(await f.backend.authenticateOriginalBearer(token),identity);
  assert.deepEqual(calls,['factory:'+token,'getUser:'+token,'sintagma_support_event_authorize:{}']);assert.equal(f.calls.length,0);
});
test('getUser failure never reaches authorization or leaks its detail',async()=>{
  let rpc=0;const f=fixture({userClient:()=>({auth:{async getUser(){throw new Error('Bearer private-secret');}},async rpc(){rpc++;return {data:identity,error:null};}})});
  await assert.rejects(f.backend.authenticateOriginalBearer('private-secret'),isCode('unauthorized'));assert.equal(rpc,0);
});
test('OAuth identity must match the real user id',async()=>{
  const f=fixture({userClient:()=>({auth:{async getUser(){return {data:{user:{id:'44444444-4444-4444-8444-444444444444'}},error:null};}},async rpc(){return {data:identity,error:null};}})});
  await assert.rejects(f.backend.authenticateOriginalBearer('token'),isCode('forbidden'));
});
test('authorize rejects a malformed client/session identity',async()=>{
  const f=fixture({userClient:()=>({auth:{async getUser(){return {data:{user:{id:identity.user_id}},error:null};}},async rpc(){return {data:{...identity,client_id:null},error:null};}})});
  await assert.rejects(f.backend.authenticateOriginalBearer('token'),isCode('forbidden'));
});
test('revocation is read anew on each call without identity cache',async()=>{
  let n=0;const f=fixture({userClient:()=>({auth:{async getUser(){return {data:{user:{id:identity.user_id}},error:null};}},async rpc(){return ++n===1?{data:identity,error:null}:{data:null,error:{code:'42501',message:'sensitive detail'}};}})});
  await f.backend.authenticateOriginalBearer('token');await assert.rejects(f.backend.authenticateOriginalBearer('token'),isCode('forbidden'));assert.equal(n,2);
});
test('service API cannot call arbitrary financial or worker RPCs',async()=>{
  const f=fixture();await assert.rejects(f.backend.serviceRpc('issue_sintagma_postpaid_invoice',{}),isCode('operation_failed'));
  await assert.rejects(f.backend.serviceRpc('sintagma_support_event_runtime_config',{}),isCode('operation_failed'));assert.equal(f.calls.length,0);
});
test('only identity/subscription/unsubscribe arguments are forwarded unchanged',async()=>{
  const f=fixture();const args={p_user_id:identity.user_id};await f.backend.serviceRpc('sintagma_support_event_identity',args);assert.deepEqual(f.calls[0],{name:'sintagma_support_event_identity',args});
});
for(const [code,expected] of [['42501','forbidden'],['XX000','operation_failed']] as const) {
  test(`service error ${code} is redacted`,async()=>{
    const f=fixture({serviceClient:()=>({async rpc(){return {data:null,error:{code,message:'whsec_secret https://private.callback/token?key=hidden'}};}})});
    await assert.rejects(f.backend.serviceRpc('sintagma_support_event_unsubscribe',{}),isCode(expected));
  });
}
test('disabled runtime cannot load an active signing cipher',async()=>{
  const f=fixture({loadConfig:async()=>({enabled:false,encryptionKey:{key_base64:key},workerToken:key})});await assert.rejects(f.backend.secretCrypto(),isCode('configuration_unavailable'));
});
test('bad encryption key gives a fixed safe error',async()=>{
  const f=fixture({loadConfig:async()=>({enabled:true,encryptionKey:{key_base64:'hidden'},workerToken:key})});await assert.rejects(f.backend.secretCrypto(),isCode('configuration_unavailable'));
});
test('encrypted envelope binds to current owner/client/name/callback AAD',async()=>{
  const f=fixture();const crypt=await f.backend.secretCrypto();const aad=secretAad({owner_user_id:identity.user_id,oauth_client_id:identity.client_id,event_name:'support.problem_report.created',callback_url:'https://callback.openai.com/event'});
  const envelope=await crypt.encryptSecret(secret,aad);assert.equal(await crypt.decryptSecret(envelope,aad),secret);assert.equal(JSON.stringify(envelope).includes(secret),false);
  await assert.rejects(crypt.decryptSecret(envelope,aad+'different'));
});
test('runtime encryption configuration is reread for refresh/key rotation',async()=>{
  let reads=0;const f=fixture({loadConfig:async()=>({enabled:true,encryptionKey:{key_base64:btoa(String.fromCharCode(...new Uint8Array(32).fill(++reads)))},workerToken:key})});
  const a=await f.backend.secretCrypto(),b=await f.backend.secretCrypto();assert.notEqual(a.kid,b.kid);assert.equal(reads,2);
});
test('runtime connects the signed callback verifier to the injected pinned transport',async()=>{
  let posts=0;
  const f=fixture({transport:{assertReady(){},async post(input){
    posts++;const body=JSON.parse(new TextDecoder().decode(input.body));
    assert.equal(body.type,'verification');assert.equal(input.headers['X-MCP-Subscription-Id'],'sub_'+'a'.repeat(64));
    assert.ok(input.headers['webhook-signature']);
    return {status:200,body:new TextEncoder().encode(JSON.stringify({challenge:body.challenge}))};
  }}});
  await f.backend.verifyCallback({url:'https://callback.openai.com/events',secret,subscriptionId:'sub_'+'a'.repeat(64),principalKey:JSON.stringify([identity.user_id,identity.client_id])});assert.equal(posts,1);
});
test('runtime readiness/config RPCs exist in the actual shared SQL candidate contract',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
  const sqlName='20261103011000_support_mcp_events_runtime_disabled.sql';
  let sql:string;
  try{sql=await fs.readFile(path.join(root,'supabase/migrations',sqlName),'utf8');}
  catch{sql=await fs.readFile(path.join(root,'../db-candidate',sqlName),'utf8');}
  const declarations=new Set(Array.from(sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(/gi),m=>m[1]));
  const f=fixture();await f.backend.isReady();assert.ok(declarations.has(f.calls[0].name),f.calls[0].name);
  assert.ok(declarations.has('sintagma_support_event_runtime_config'));
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.sintagma_support_event_runtime_config\(\),public\.sintagma_support_event_runtime_readiness\(\)/);
});
