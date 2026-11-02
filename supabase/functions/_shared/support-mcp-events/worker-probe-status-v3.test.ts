import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {base64Encode} from './crypto.ts';
import {CallbackTransportError,createPinnedHttpsTransport,DENO_NODE_HTTPS_PINNING_PROVEN,type TransportDependencies,type PinnedHttpsTransport} from './pinned-https.ts';
import {createWorkerHttpHandler,signProbe,signWake,type RuntimeConfig} from './worker-http.ts';
import {createCallbackVerifier,CallbackEndpointError} from './webhooks.ts';
import {outcomeForStatus,type RpcClient} from './delivery.ts';

type Fake={status?:number;noLookup?:boolean;noIdentity?:boolean;authorized?:boolean;remote?:string;chunk?:Uint8Array};
function socketDouble(settings:Fake={}){
  const calls:{options:Record<string,any>;body?:Uint8Array;destroyed?:boolean;lookup?:boolean;identity?:boolean}[]=[];
  const request=((options:Record<string,any>,onResponse:(response:any)=>void)=>{
    const call={options} as typeof calls[number];calls.push(call);
    const req=new EventEmitter() as EventEmitter&{end:(body:Uint8Array)=>void;destroy:()=>void};
    req.destroy=()=>{call.destroyed=true;};
    req.end=body=>{call.body=Uint8Array.from(body);queueMicrotask(()=>{
      if(call.destroyed)return;
      const res=new EventEmitter() as any;res.statusCode=settings.status??403;res.destroy=()=>{};
      onResponse(res);if(settings.chunk)res.emit('data',settings.chunk);res.emit('end');
    });};
    queueMicrotask(()=>{
      let address='8.8.8.8';
      if(!settings.noLookup){options.lookup(options.hostname,{},(_error:unknown,value:string)=>{address=value;call.lookup=true;});}
      if(!settings.noIdentity){call.identity=true;options.checkServerIdentity(options.hostname,{});}
      const socket=new EventEmitter() as any;socket.authorized=settings.authorized??true;socket.remoteAddress=settings.remote??address;
      req.emit('socket',socket);queueMicrotask(()=>socket.emit('secureConnect'));
    });return req;
  }) as unknown as NonNullable<TransportDependencies['request']>;
  return{calls,request};
}
const resolve=async()=>[{address:'8.8.8.8',family:4 as const}];
for(const status of [403,503])test('fixed HEAD '+status+' proves compatibility only after DNS, lookup, TLS and actual-IP gates',async()=>{
  const fake=socketDouble({status});let dns=0,identityHost='';
  const transport=createPinnedHttpsTransport({resolve:async()=>{dns++;return resolve();},request:fake.request,identityCheck:host=>{identityHost=host;return undefined;}});
  assert.deepEqual(await transport.probeRuntime!(),{status});assert.equal(dns,1);assert.equal(identityHost,'developers.openai.com');
  const call=fake.calls[0],o=call.options;assert.equal(call.lookup,true);assert.equal(call.identity,true);assert.equal(call.body!.byteLength,0);
  assert.equal(o.method,'HEAD');assert.equal(o.hostname,'developers.openai.com');assert.equal(o.servername,o.hostname);assert.equal(o.path,'/plugins/build/mcp-events');
  assert.equal(o.rejectUnauthorized,true);assert.equal(o.agent,false);assert.deepEqual(o.headers,{'Content-Length':'0',Connection:'close'});
  assert.equal(DENO_NODE_HTTPS_PINNING_PROVEN,false);
});
for(const settings of [{noLookup:true},{noIdentity:true},{authorized:false},{remote:'1.1.1.1'}])test('non-2xx HEAD never bypasses pinning '+JSON.stringify(settings),async()=>{
  const fake=socketDouble({status:403,...settings});const transport=createPinnedHttpsTransport({resolve,request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(transport.probeRuntime!(),e=>e instanceof CallbackTransportError&&e.reason==='pinning_failed');
  assert.equal(fake.calls[0].body,undefined);
});
test('HEAD with certificate identity failure does not send even when authorization is reported true',async()=>{
  const fake=socketDouble({status:503}),transport=createPinnedHttpsTransport({resolve,request:fake.request,identityCheck:()=>new Error('synthetic identity rejection')});
  await assert.rejects(transport.probeRuntime!(),e=>e instanceof CallbackTransportError&&e.reason==='pinning_failed');assert.equal(fake.calls[0].body,undefined);
});
test('HEAD redirect stays blocked and does not follow Location',async()=>{
  const fake=socketDouble({status:302}),transport=createPinnedHttpsTransport({resolve,request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(transport.probeRuntime!(),e=>e instanceof CallbackTransportError&&e.reason==='redirect_blocked'&&e.httpStatus===302);assert.equal(fake.calls.length,1);
});
test('HEAD error status does not relax the zero-body response budget',async()=>{
  const fake=socketDouble({status:403,chunk:new Uint8Array([1])}),transport=createPinnedHttpsTransport({resolve,request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(transport.probeRuntime!(),e=>e instanceof CallbackTransportError&&e.reason==='response_too_large'&&e.httpStatus===403);
});
const clock=1700000000000,timestamp=String(clock/1000),nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token=base64Encode(new Uint8Array(32).fill(31)),key=base64Encode(new Uint8Array(32).fill(32));
async function signedRequest(probe=true,valid=true){
  return new Request('https://project.supabase.co/functions/v1/support-event-delivery'+(probe?'?probe=pinning':''),{method:'POST',body:'{}',headers:{'content-type':'application/json',
    'x-sintagma-events-timestamp':timestamp,'x-sintagma-events-nonce':nonce,'x-sintagma-events-signature':valid?await (probe?signProbe:signWake)(timestamp,nonce,token):'0'.repeat(64)}});
}
function httpFailure(error:Error,enabled=false){
  const order:string[]=[];const config:RuntimeConfig={enabled,encryptionKey:{key_base64:key},workerToken:token};
  const client:RpcClient={async rpc(name){order.push(name);return{data:name.endsWith('_runtime_config')?config:true,error:null};}};
  const transport:PinnedHttpsTransport={assertReady(){throw error;},async post(){throw error;},async probeRuntime(){order.push('fixedProbe');throw error;}};
  const handler=createWorkerHttpHandler({client,env:()=>undefined,transport,now:()=>clock});return{handler,order};
}
for(const status of [302,503])test('authenticated one-shot probe exposes only bounded failure HTTP status '+status,async()=>{
  const f=httpFailure(new CallbackTransportError('redirect_blocked',status));const response=await f.handler(await signedRequest());
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'redirect_blocked',httpStatus:status});
  assert.deepEqual(f.order,['sintagma_support_event_runtime_config','sintagma_support_event_consume_probe_nonce','fixedProbe']);
});
test('probe diagnostics omit invalid status and unexpected error text, URL, IP and secrets',async()=>{
  for(const status of [0,600,NaN,Infinity,201.5]){
    const f=httpFailure(new CallbackTransportError('network_error',status)),response=await f.handler(await signedRequest());assert.deepEqual(await response.json(),{error:'network_error'});
  }
  const f=httpFailure(new Error('https://receiver.openai.com/secret 8.8.8.8 '+token+' '+key));
  assert.deepEqual(await (await f.handler(await signedRequest())).json(),{error:'worker_failed'});
});
test('unauthenticated probe and wake failures do not expose transport HTTP diagnostics',async()=>{
  const bad=httpFailure(new CallbackTransportError('network_error',503));assert.deepEqual(await (await bad.handler(await signedRequest(true,false))).json(),{error:'unauthorized'});assert.ok(!bad.order.includes('fixedProbe'));
  const wake=httpFailure(new CallbackTransportError('pinning_failed',403),true);assert.deepEqual(await (await wake.handler(await signedRequest(false))).json(),{error:'pinning_failed'});
});
test('formal callback challenge continues to require 2xx despite HEAD compatibility classification',async()=>{
  for(const status of [403,503]){
    const transport:PinnedHttpsTransport={assertReady(){},async post(input){const challenge=JSON.parse(new TextDecoder().decode(input.body)).challenge;return{status,body:new TextEncoder().encode(JSON.stringify({challenge}))};}};
    await assert.rejects(createCallbackVerifier({transport})({url:'https://receiver.openai.com/events',secret:'whsec_'+token,subscriptionId:'sub_'+'1'.repeat(64),principalKey:'synthetic-principal'}),e=>e instanceof CallbackEndpointError&&e.reason==='challenge_failed');
  }
  assert.equal(outcomeForStatus(403),'permanent');assert.equal(outcomeForStatus(503),'retry');assert.equal(outcomeForStatus(204),'accepted');
});
