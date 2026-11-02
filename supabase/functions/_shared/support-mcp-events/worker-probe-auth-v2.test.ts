import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {base64Encode} from './crypto.ts';
import {createWorkerHttpHandler,signProbe,signWake,type RuntimeConfig} from './worker-http.ts';
import type {RpcClient} from './delivery.ts';
import {CallbackTransportError,type PinnedHttpsTransport} from './pinned-https.ts';

const now=1700000000000,ts=String(now/1000);
const nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherNonce='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token=base64Encode(new Uint8Array(32).fill(21));
const key=base64Encode(new Uint8Array(32).fill(31));
const service='synthetic-service-key-not-queued';
const endpoint='https://project.supabase.co/functions/v1/support-event-delivery';
const names=['sintagma_support_event_runtime_config','sintagma_support_event_consume_probe_nonce'];
async function request(options:{purpose?:'probe'|'wake';timestamp?:string;nonce?:string;headers?:Record<string,string>;body?:string;query?:string}={}){
  const timestamp=options.timestamp??ts,n=options.nonce??nonce;
  const signature=options.purpose==='wake'?await signWake(timestamp,n,token):await signProbe(timestamp,n,token);
  return new Request(endpoint+(options.query??'?probe=pinning'),{method:'POST',headers:{'content-type':'application/json',
    'x-sintagma-events-timestamp':timestamp,'x-sintagma-events-nonce':n,'x-sintagma-events-signature':signature,...options.headers},body:options.body??'{}'});
}
function fixture(){
  let enabled=false,probeCount=0,rejectNonce=false,failNonce=false,failProbe=false;
  const seen=new Set<string>(),calls:{name:string;args:Record<string,unknown>}[]=[],order:string[]=[];
  const config=():RuntimeConfig=>({enabled,encryptionKey:{key_base64:key,kid:'vault-v1'},workerToken:token});
  const client:RpcClient={async rpc(name,args){
    calls.push({name,args});order.push(name);
    if(name===names[0])return{data:config(),error:null};
    if(name===names[1]||name==='sintagma_support_event_consume_wake_nonce'){
      if(failNonce)return{data:null,error:{message:token+' '+key}};
      if(rejectNonce||seen.has(String(args.p_nonce)))return{data:false,error:null};
      seen.add(String(args.p_nonce));return{data:true,error:null};
    }
    if(name==='sintagma_support_event_claim')return{data:[],error:null};
    throw new Error('unexpected RPC');
  }};
  const transport:PinnedHttpsTransport={assertReady(){},async post(){throw new Error('application delivery forbidden');},async probeRuntime(){
    probeCount++;order.push('fixedProbe');if(failProbe)throw new CallbackTransportError('pinning_failed');return{status:200};
  }};
  const handler=createWorkerHttpHandler({client,env:n=>n==='SUPABASE_SERVICE_ROLE_KEY'?service:undefined,transport,now:()=>now});
  return{handler,calls,order,seen,probes:()=>probeCount,setEnabled:(x:boolean)=>{enabled=x;},rejectReplay:()=>{rejectNonce=true;},failNonce:()=>{failNonce=true;},failProbe:()=>{failProbe=true;}};
}
test('probe HMAC independently matches exact purpose-separated bytes',async()=>{
  const expected=createHmac('sha256',Buffer.from(token,'base64')).update(`sintagma-support-events-probe-v1\n${ts}\n${nonce}`).digest('hex');
  assert.equal(await signProbe(ts,nonce,token),expected);assert.notEqual(await signProbe(ts,nonce,token),await signWake(ts,nonce,token));
});
test('valid one-shot probe HMAC consumes its backend nonce before the fixed probe without service Bearer',async()=>{
  const f=fixture(),response=await f.handler(await request());assert.equal(response.status,200);
  assert.deepEqual(f.order,[...names,'fixedProbe']);assert.deepEqual(f.calls[1].args,{p_nonce:nonce,p_timestamp:Number(ts)});
  assert.deepEqual(await response.json(),{probe:'pinning',observed:true,httpStatus:200,deliveryEnabled:false,readinessMarker:false});assert.equal(f.probes(),1);
});
test('probe purpose cannot authorize a wake and wake purpose cannot authorize a probe',async()=>{
  for(const options of [{purpose:'probe' as const,query:''},{purpose:'wake' as const}]){
    const f=fixture(),response=await f.handler(await request(options));assert.equal(response.status,401);assert.equal(f.probes(),0);assert.ok(!f.calls.some(x=>x.name.includes('consume')||x.name.endsWith('_claim')));
  }
});
test('replayed probe nonce never reaches a second network probe',async()=>{
  const f=fixture();assert.equal((await f.handler(await request())).status,200);const repeated=await f.handler(await request());assert.equal(repeated.status,409);assert.deepEqual(await repeated.json(),{error:'probe_replayed_or_expired'});assert.equal(f.probes(),1);
});
test('shared nonce ledger prevents reuse across valid probe and wake purposes',async()=>{
  const f=fixture();assert.equal((await f.handler(await request())).status,200);f.setEnabled(true);
  const response=await f.handler(await request({purpose:'wake',query:''}));assert.equal(response.status,409);assert.ok(!f.calls.some(x=>x.name.endsWith('_claim')));assert.equal(f.seen.size,1);
});
for(const delta of [-61,6])test('probe TTL rejects out-of-window '+delta+' before Vault access',async()=>{
  const f=fixture(),response=await f.handler(await request({timestamp:String(Number(ts)+delta)}));assert.equal(response.status,401);assert.equal(f.calls.length,0);assert.equal(f.probes(),0);
});
for(const delta of [-60,5])test('probe TTL accepts inclusive boundary '+delta+' with backend nonce verification',async()=>{
  const f=fixture(),response=await f.handler(await request({timestamp:String(Number(ts)+delta)}));assert.equal(response.status,200);assert.equal(f.probes(),1);assert.equal(f.calls[1].args.p_timestamp,Number(ts)+delta);
});
test('probe requires disabled delivery even with a valid purpose HMAC',async()=>{
  const f=fixture();f.setEnabled(true);const response=await f.handler(await request());assert.equal(response.status,409);assert.equal(f.calls.length,1);assert.equal(f.probes(),0);assert.equal(f.seen.size,0);
});
test('unknown private control headers and ambiguous Bearer/HMAC modes are rejected',async()=>{
  for(const headers of [{'x-sintagma-events-url':'https://127.0.0.1/'},{'x-sintagma-events-purpose':'wake'},{authorization:'Basic invalid'},{authorization:'Bearer '+service},{authorization:''}] as Record<string,string>[]){
    const f=fixture();const response=await f.handler(await request({headers}));assert.equal(response.status,401);assert.equal(f.calls.length,0);assert.equal(f.probes(),0);
  }
});
test('malformed or modified control envelope cannot consume a nonce',async()=>{
  for(const headers of [
    {'x-sintagma-events-signature':'0'.repeat(64)},
    {'x-sintagma-events-signature':'A'.repeat(64)},
    {'x-sintagma-events-timestamp':'0'+ts},
    {'x-sintagma-events-timestamp':ts+', '+ts},
    {'x-sintagma-events-nonce':otherNonce},
    {'x-sintagma-events-nonce':nonce+', '+nonce},
  ] as Record<string,string>[]){
    const f=fixture();const response=await f.handler(await request({headers}));assert.equal(response.status,401);assert.equal(f.probes(),0);assert.ok(!f.calls.some(x=>x.name.includes('consume')));
  }
});
test('nonce RPC failure or denial is fail-closed before network and does not expose secrets',async()=>{
  for(const mode of ['deny','error']){
    const f=fixture();if(mode==='deny')f.rejectReplay();else f.failNonce();const response=await f.handler(await request());assert.equal(response.status,mode==='deny'?409:503);assert.equal(f.probes(),0);const body=await response.text();for(const secret of [token,key,nonce,endpoint,service])assert.ok(!body.includes(secret));
  }
});
test('fixed transport failure is bounded and redacted after consuming the one-use nonce',async()=>{
  const f=fixture();f.failProbe();const response=await f.handler(await request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'pinning_failed'});assert.equal(f.seen.size,1);assert.equal(f.probes(),1);
});
test('probe accepts ordinary HTTP metadata but not a caller-selected target or nonempty JSON body',async()=>{
  const f=fixture();assert.equal((await f.handler(await request({headers:{'user-agent':'synthetic QA'}}))).status,200);
  for(const options of [{query:'?probe=pinning&url=https://127.0.0.1/'},{query:'?probe=pinning&probe=pinning'},{body:'{ }'},{body:'{} '}]){
    const g=fixture();assert.equal((await g.handler(await request(options))).status,400);assert.equal(g.calls.length,0);assert.equal(g.probes(),0);
  }
});
test('existing service-Bearer-only probe remains available without a one-shot HMAC nonce',async()=>{
  const f=fixture();const response=await f.handler(new Request(endpoint+'?probe=pinning',{method:'POST',headers:{authorization:'Bearer '+service,'content-type':'application/json'},body:'{}'}));assert.equal(response.status,200);assert.deepEqual(f.order,[names[0],'fixedProbe']);assert.equal(f.seen.size,0);
});
