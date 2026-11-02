import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNativeDenoHttpsTransport,type NativeDenoRuntime,type NativeConn,type NativeTlsConn} from './native-deno-https.ts';
import {NativeHttpsTransportError,safeNativePinDiagnostics,type NativePinDiagnostics,type PinnedHttpsTransport} from './callback-policy.ts';
import {createWorkerHttpHandler,signProbe,signWake,type RuntimeConfig} from './worker-http.ts';
import {base64Encode} from './crypto.ts';
import type {RpcClient} from './delivery.ts';
const rawAddress={transport:'tcp',hostname:'8.8.8.8',port:443};
const positive={shape:'object',transport:'tcp',public:true,ipEqual:true,portMatch:true} as const;
function fake(tlsAddress:unknown,rawRemote:unknown=rawAddress){
  let writes=0,wraps=0;const response=new TextEncoder().encode('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');let read=false;
  const raw:NativeConn={remoteAddr:rawRemote,async read(){throw Error('raw read forbidden');},async write(){throw Error('raw write forbidden');},close(){}};
  const tls:NativeTlsConn={get remoteAddr(){if(tlsAddress instanceof Error)throw tlsAddress;return tlsAddress;},async handshake(){return{alpnProtocol:'http/1.1'};},async read(buffer){if(read)return null;read=true;buffer.set(response);return response.length;},async write(buffer){writes++;return buffer.length;},close(){}};
  const runtime:NativeDenoRuntime={async resolveDns(_host,rr){return rr==='A'?['8.8.8.8']:[];},async connect(){return raw;},async startTls(conn,options){wraps++;assert.equal(conn,raw);assert.deepEqual(options,{hostname:'developers.openai.com',alpnProtocols:['http/1.1']});return tls;}};
  return{transport:createNativeDenoHttpsTransport({runtime}),writes:()=>writes,wraps:()=>wraps};
}
test('documented startTls absent transport and explicit tcp both retain exact public-IP/443 checks',async()=>{
  for(const transport of ['absent','tcp'] as const){
    const address=transport==='absent'?{hostname:'8.8.8.8',port:443}:rawAddress,f=fake(address);
    assert.deepEqual(await f.transport.probeRuntime!(),{status:403,implementation:'deno-native-http1',pinDiagnostics:{raw:positive,tls:{...positive,transport}}});assert.equal(f.writes(),1);
  }
});
test('raw TCP remains explicit and every present non-tcp TLS transport fails before HTTP',async()=>{
  for(const address of [{hostname:'8.8.8.8',port:443},{...rawAddress,transport:undefined}]){
    const f=fake(rawAddress,address);await assert.rejects(f.transport.probeRuntime!(),e=>e instanceof NativeHttpsTransportError&&e.phase==='raw_pin'&&e.reason==='pinning_failed'&&e.pinDiagnostics?.tls===undefined);assert.equal(f.wraps(),0);assert.equal(f.writes(),0);
  }
  for(const transport of [undefined,null,'udp','tls','unknown',123]){
    const f=fake({...rawAddress,transport});await assert.rejects(f.transport.probeRuntime!(),e=>e instanceof NativeHttpsTransportError&&e.phase==='tls_pin'&&e.reason==='pinning_failed'&&e.pinDiagnostics?.tls?.transport!=='absent');assert.equal(f.writes(),0);
  }
});
test('absent TLS transport never admits private/different/FQDN host or nonnumeric/wrong port',async()=>{
  for(const address of [{hostname:'127.0.0.1',port:443},{hostname:'1.1.1.1',port:443},{hostname:'developers.openai.com',port:443},{hostname:'8.8.8.8',port:'443'},{hostname:'8.8.8.8',port:8443}]){
    const f=fake(address);await assert.rejects(f.transport.probeRuntime!(),e=>e instanceof NativeHttpsTransportError&&e.phase==='tls_pin'&&e.reason==='pinning_failed');assert.equal(f.writes(),0);
  }
});
test('diagnostic copying snapshots getters once and strips unknown fields without echoing unsafe values',()=>{
  const secret='SYNTHETIC_ADDRESS_OR_KEY_NEVER_OUTPUT';let reads=0;
  const row={...positive,get transport(){reads++;return reads===1?'tcp':secret;},hostname:secret,url:secret};
  const copied=safeNativePinDiagnostics({raw:row,tls:{...positive,transport:'absent'},secret});
  assert.deepEqual(copied,{raw:positive,tls:{...positive,transport:'absent'}});assert.equal(reads,1);assert.ok(!JSON.stringify(copied).includes(secret));
  for(const value of [null,[],{raw:{...positive,shape:secret}},{raw:{...positive,transport:secret}},{raw:{...positive,public:secret}},{raw:positive,tls:{...positive,ipEqual:secret}}])assert.equal(safeNativePinDiagnostics(value),undefined);
});
const clock=1700000000000,ts=String(clock/1000),nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key=base64Encode(new Uint8Array(32).fill(9));
async function request(probe=true,valid=true){return new Request('https://project.supabase.co/functions/v1/support-event-delivery'+(probe?'?probe=pinning':''),{method:'POST',body:'{}',headers:{'content-type':'application/json','x-sintagma-events-timestamp':ts,'x-sintagma-events-nonce':nonce,'x-sintagma-events-signature':valid?await(probe?signProbe:signWake)(ts,nonce,key):'0'.repeat(64)}});}
function handler(transport:PinnedHttpsTransport,enabled=false){
  const config:RuntimeConfig={enabled,encryptionKey:{key_base64:key},workerToken:key},calls:string[]=[];
  const client:RpcClient={async rpc(name){calls.push(name);return{data:name.endsWith('_runtime_config')?config:true,error:null};}};
  return{handle:createWorkerHttpHandler({client,transport,env:()=>undefined,now:()=>clock}),calls};
}
test('authenticated fixed probe returns bounded raw/TLS diagnostics after its nonce on success',async()=>{
  const f=fake({hostname:'8.8.8.8',port:443}),h=handler(f.transport),response=await h.handle(await request());
  assert.equal(response.status,200);assert.deepEqual(h.calls,['sintagma_support_event_runtime_config','sintagma_support_event_consume_probe_nonce']);
  assert.deepEqual(await response.json(),{probe:'pinning',observed:true,httpStatus:403,deliveryEnabled:false,readinessMarker:false,implementation:'deno-native-http1',nativeReadinessMarker:false,pinDiagnostics:{raw:positive,tls:{...positive,transport:'absent'}}});
});
test('authenticated fixed probe reports only enum/boolean snapshots on pin failure, before HTTP bytes',async()=>{
  const f=fake({...rawAddress,transport:'udp'}),h=handler(f.transport),response=await h.handle(await request());
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'pinning_failed',implementation:'deno-native-http1',phase:'tls_pin',pinDiagnostics:{raw:positive,tls:{...positive,transport:'udp'}}});assert.equal(f.writes(),0);
});
test('anonymous and wake paths never expose pin diagnostics and malformed success metadata is omitted',async()=>{
  const pinDiagnostics:NativePinDiagnostics={raw:positive,tls:{...positive,transport:'absent'}},error=new NativeHttpsTransportError('pinning_failed','tls_pin',undefined,pinDiagnostics);
  const transport:PinnedHttpsTransport={implementation:'deno-native-http1',assertReady(){throw error;},async post(){throw error;},async probeRuntime(){throw error;}};
  assert.deepEqual(await(await handler(transport).handle(await request(true,false))).json(),{error:'unauthorized'});
  assert.deepEqual(await(await handler(transport,true).handle(await request(false))).json(),{error:'pinning_failed'});
  const malformed={...transport,async probeRuntime(){return{status:200,implementation:'deno-native-http1' as const,pinDiagnostics:{raw:{...positive,transport:'SYNTHETIC_SECRET'}} as unknown as NativePinDiagnostics};}};
  const body=await(await handler(malformed).handle(await request())).json();assert.equal(body.pinDiagnostics,undefined);assert.ok(!JSON.stringify(body).includes('SYNTHETIC_SECRET'));
});
test('an unreadable TLS address becomes a bounded diagnostic without exposing its raw error',async()=>{
  const secret='SYNTHETIC_UNSAFE_ERROR https://secret.invalid/path 127.0.0.1',f=fake(new Error(secret)),response=await handler(f.transport).handle(await request());
  const body=await response.json();assert.equal(response.status,503);assert.deepEqual(body.pinDiagnostics,{raw:positive,tls:{shape:'unreadable',transport:'other',public:false,ipEqual:false,portMatch:false}});assert.ok(!JSON.stringify(body).includes(secret));assert.equal(f.writes(),0);
});
