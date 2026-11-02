import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNativeDenoHttpsTransport,DENO_NATIVE_HTTPS_PINNING_PROVEN,type NativeDenoRuntime,type NativeConn,type NativeTlsConn} from './native-deno-https.ts';
import {createPinnedHttpsTransport,DENO_NODE_HTTPS_PINNING_PROVEN,NativeHttpsTransportError,CallbackTransportError,type PinnedHttpsTransport} from './pinned-https.ts';
import {base64Encode} from './crypto.ts';
import {createWorkerHttpHandler,signProbe,signWake,type RuntimeConfig} from './worker-http.ts';
import type {RpcClient} from './delivery.ts';
const encoder=new TextEncoder();
const public4={transport:'tcp',hostname:'8.8.8.8',port:443};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
type Stage='dns'|'connect'|'tls'|'handshake'|'write'|'read';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
type Settings={A?:string[];AAAA?:string[];dnsError?:Partial<Record<'A'|'AAAA',Error>>;rawRemote?:unknown;tlsRemote?:unknown;alpn?:unknown;status?:number;response?:string;partial?:number;stall?:Stage;fail?:Stage;fragment?:number};
function fixture(settings:Settings={}){
  const order:string[]=[],writes:Uint8Array[]=[],dns:{host:string;rr:string;signal?:AbortSignal}[]=[],connectOptions:unknown[]=[],tlsOptions:unknown[]=[];
  let rawClosed=0,tlsClosed=0,reads=0,offset=0,wrapped=false;
  const response=encoder.encode(settings.response??`HTTP/1.1 ${settings.status??403} Response\r\nContent-Length: 12345\r\n\r\n`);
  const rawGate=deferred<NativeConn>(),tlsGate=deferred<NativeTlsConn>();
  const raw:NativeConn={get remoteAddr(){order.push('rawPin');return settings.rawRemote??public4;},async read(){throw Error('raw read forbidden');},async write(){throw Error('raw write forbidden');},close(){rawClosed++;order.push('rawClose');}};
  const tls:NativeTlsConn={get remoteAddr(){order.push('tlsPin');return settings.tlsRemote??settings.rawRemote??public4;},
    async handshake(){order.push('handshake');if(settings.fail==='handshake')throw Error('secret handshake detail');if(settings.stall==='handshake')return new Promise(()=>{});return{alpnProtocol:settings.alpn===undefined?'http/1.1':settings.alpn as string|null};},
    async read(buffer){order.push('read');reads++;if(settings.fail==='read')throw Error('unsafe TLS read detail');if(settings.stall==='read')return new Promise(()=>{});if(offset===response.length)return null;const n=Math.min(buffer.length,settings.fragment??buffer.length,response.length-offset);buffer.set(response.subarray(offset,offset+n));offset+=n;return n;},
    async write(buffer){order.push('write');if(settings.fail==='write')throw Error('unsafe TLS write detail');if(settings.stall==='write')return new Promise(()=>{});const n=Math.min(buffer.length,settings.partial??buffer.length);writes.push(Uint8Array.from(buffer.subarray(0,n)));return n;},close(){tlsClosed++;order.push('tlsClose');},
  };
  const runtime:NativeDenoRuntime={async resolveDns(host,rr,options){order.push('dns:'+rr);dns.push({host,rr,signal:options?.signal});if(settings.fail==='dns')throw Error('unsafe DNS detail');if(settings.stall==='dns')return new Promise(()=>{});if(settings.dnsError?.[rr])throw settings.dnsError[rr];return rr==='A'?(settings.A??['8.8.8.8']):(settings.AAAA??['2606:4700:4700::1111']);},
    async connect(options){order.push('connect');connectOptions.push(options);offset=0;if(settings.fail==='connect')throw Error('secret connect detail');if(settings.stall==='connect')return rawGate.promise;return raw;},
    async startTls(connection,options){order.push('startTls');assert.equal(connection,raw);wrapped=true;tlsOptions.push(options);if(settings.fail==='tls')throw Error('secret TLS detail');if(settings.stall==='tls')return tlsGate.promise;return tls;},
  };
  return{runtime,raw,tls,order,writes,dns,connectOptions,tlsOptions,lateRaw:()=>rawGate.resolve(raw),lateTls:()=>tlsGate.resolve(tls),rawClosed:()=>rawClosed,tlsClosed:()=>tlsClosed,reads:()=>reads,wrapped:()=>wrapped};
}
function reason(expected:string,phase?:string){return(error:unknown)=>error instanceof NativeHttpsTransportError&&error.reason===expected&&(!phase||error.phase===phase)&&error.message===expected;}
for(const status of [200,403,503])test('native fixed HEAD '+status+' uses literal TCP, original TLS hostname, explicit handshake and closes',async()=>{
  const f=fixture({status,partial:3,fragment:1}),transport=createNativeDenoHttpsTransport({runtime:f.runtime});
  assert.deepEqual(await transport.probeRuntime!(),{status,implementation:'deno-native-http1'});
  assert.deepEqual(f.connectOptions,[{hostname:'8.8.8.8',port:443,transport:'tcp'}]);assert.deepEqual(f.tlsOptions,[{hostname:'developers.openai.com',alpnProtocols:['http/1.1']}]);
  assert.deepEqual(f.order.slice(0,7),['dns:A','dns:AAAA','connect','rawPin','startTls','handshake','tlsPin']);
  const bytes=Buffer.concat(f.writes.map(b=>Buffer.from(b))).toString('utf8');
  assert.equal(bytes,'HEAD /plugins/build/mcp-events HTTP/1.1\r\nHost: developers.openai.com\r\nConnection: close\r\nContent-Length: 0\r\nAccept-Encoding: identity\r\n\r\n');
  assert.equal(f.rawClosed(),0);assert.equal(f.tlsClosed(),1);assert.ok(f.dns.every(d=>d.signal?.aborted));
  assert.equal(DENO_NATIVE_HTTPS_PINNING_PROVEN,false);assert.equal(DENO_NODE_HTTPS_PINNING_PROVEN,false);
});
test('native delivery remains gated before DNS even when all APIs and transport are available',async()=>{
  const f=fixture(),transport=createNativeDenoHttpsTransport({runtime:f.runtime});
  assert.throws(()=>transport.assertReady(),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');
  await assert.rejects(transport.post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{}}),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');assert.deepEqual(f.order,[]);
});
test('native feature detection selects actual Deno APIs while explicit Node dependency injection preserves the old path',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Deno'),f=fixture();
  try{Object.defineProperty(globalThis,'Deno',{value:f.runtime,configurable:true});assert.equal(createPinnedHttpsTransport().implementation,'deno-native-http1');assert.equal(createPinnedHttpsTransport({resolve:async()=>[]}).implementation,'node-https');assert.equal(f.order.length,0);}
  finally{if(descriptor)Object.defineProperty(globalThis,'Deno',descriptor);else delete(globalThis as {Deno?:unknown}).Deno;}
});
test('native fixed probe ignores caller arguments and has no destination or credential override',async()=>{
  const f=fixture();await (createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime as Function)({url:'https://127.0.0.1/private',headers:{Authorization:'secret'},body:encoder.encode('secret')});
  assert.equal(f.dns[0].host,'developers.openai.com');assert.ok(!Buffer.concat(f.writes.map(b=>Buffer.from(b))).includes(Buffer.from('secret')));
});
test('native probe performs fresh A and AAAA resolution on each separate connection',async()=>{
  const f=fixture(),transport=createNativeDenoHttpsTransport({runtime:f.runtime});await transport.probeRuntime!();await transport.probeRuntime!();assert.equal(f.dns.length,4);assert.equal(f.connectOptions.length,2);assert.equal(f.tlsClosed(),2);
});
for(const settings of [{A:['127.0.0.1']},{AAAA:['::1']},{AAAA:['::ffff:8.8.8.8']},{AAAA:['64:ff9b::808:808']},{A:['2606:4700:4700::1111']}])test('all DNS answers must be public and match record family '+JSON.stringify(settings),async()=>{
  const f=fixture(settings);await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),reason('destination_not_public','dns'));assert.equal(f.connectOptions.length,0);assert.equal(f.dns.length,2);
});
test('one NotFound record family may be empty; any other DNS failure blocks even a valid other family',async()=>{
  const missing=Object.assign(new Error('no record'),{name:'NotFound'}),f=fixture({AAAA:[],dnsError:{AAAA:missing}});
  await createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!();assert.equal(f.connectOptions.length,1);
  const bad=fixture({dnsError:{AAAA:new Error('private DNS detail')}});await assert.rejects(createNativeDenoHttpsTransport({runtime:bad.runtime}).probeRuntime!(),reason('dns_failed','dns'));assert.equal(bad.connectOptions.length,0);
  const sync=fixture();
  sync.runtime.resolveDns=(_host,rr)=>{if(rr==='AAAA')throw Error('synthetic synchronous unsupported stub');return new Promise((_resolve,reject)=>queueMicrotask(()=>reject(Error('synthetic late A rejection'))));};
  await assert.rejects(createNativeDenoHttpsTransport({runtime:sync.runtime}).probeRuntime!(),reason('dns_failed','dns'));assert.equal(sync.connectOptions.length,0);
});
test('IPv6-only public address stays literal and normalized remote comparison is accepted',async()=>{
  const f=fixture({A:[],AAAA:['2606:4700:4700::1111'],rawRemote:{transport:'tcp',hostname:'2606:4700:4700:0:0:0:0:1111',port:443}});
  await createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!();assert.deepEqual(f.connectOptions,[{hostname:'2606:4700:4700::1111',port:443,transport:'tcp'}]);
});
for(const field of ['rawRemote','tlsRemote'] as const)for(const remote of [{transport:'tcp',hostname:'1.1.1.1',port:443},{transport:'tcp',hostname:'127.0.0.1',port:443},{transport:'tcp',hostname:'8.8.8.8',port:8443},{transport:'udp',hostname:'8.8.8.8',port:443},{}])test(field+' mismatch refuses every HTTP byte '+JSON.stringify(remote),async()=>{
  const f=fixture({[field]:remote});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),reason('pinning_failed',field==='rawRemote'?'raw_pin':'tls_pin'));assert.equal(f.writes.length,0);assert.equal(field==='rawRemote'?f.rawClosed():f.tlsClosed(),1);
});
for(const fail of ['tls','handshake'] as const)test('native '+fail+' failure is redacted and occurs before HTTP writes',async()=>{
  const f=fixture({fail});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),reason('tls_failed',fail));assert.equal(f.writes.length,0);assert.equal(fail==='tls'?f.rawClosed():f.tlsClosed(),1);
});
for(const alpn of ['h2','',123,{}])test('native malformed or non-HTTP1 ALPN is refused before HTTP '+JSON.stringify(alpn),async()=>{
  const f=fixture({alpn});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),reason('tls_failed','handshake'));assert.equal(f.writes.length,0);assert.equal(f.tlsClosed(),1);
});
test('no negotiated ALPN is accepted only after the default verified TLS handshake',async()=>{const f=fixture({alpn:null});await createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!();assert.ok(f.order.indexOf('handshake')<f.order.indexOf('write'));});
for(const stall of ['dns','connect','tls','handshake','write','read'] as const)test('one application deadline bounds native '+stall+' without claiming OS-level connect cancellation',async()=>{
  const f=fixture({stall}),transport=createNativeDenoHttpsTransport({runtime:f.runtime,timeoutMs:15});await assert.rejects(transport.probeRuntime!(),reason('timeout',stall==='read'?'headers':stall));
  assert.ok(f.dns.every(d=>d.signal?.aborted));
  if(stall==='connect'){f.lateRaw();await tick();assert.equal(f.rawClosed(),1);assert.equal(f.tlsOptions.length,0);}
  if(stall==='tls'){f.lateTls();await tick();assert.equal(f.tlsClosed(),1);assert.equal(f.writes.length,0);}
  if(['handshake','write','read'].includes(stall))assert.equal(f.tlsClosed(),1);
});
test('external abort cancels DNS before connect and closes a late connection',async()=>{
  const f=fixture({stall:'connect'}),controller=new AbortController(),transport=createNativeDenoHttpsTransport({runtime:f.runtime,signal:controller.signal});const pending=transport.probeRuntime!();await tick();controller.abort();await assert.rejects(pending,reason('timeout','connect'));f.lateRaw();await tick();assert.equal(f.rawClosed(),1);assert.equal(f.writes.length,0);
});
test('already aborted native factory signal prevents DNS and socket creation',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime,signal:controller.signal}).probeRuntime!(),reason('timeout','dns'));assert.equal(f.order.length,0);
});
for(const fail of ['write','read'] as const)test('native '+fail+' errors reveal only safe classification',async()=>{
  const f=fixture({fail});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),reason('network_error',fail==='read'?'headers':fail));assert.equal(f.tlsClosed(),1);
});
test('native redirect is not followed and returns bounded status and phase',async()=>{
  const f=fixture({response:'HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1/private\r\nContent-Length: 0\r\n\r\n'});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!(),e=>reason('redirect_blocked','headers')(e)&&(e as NativeHttpsTransportError).httpStatus===302);assert.equal(f.connectOptions.length,1);
});
test('HEAD does not wait for advertised body or EOF but refuses buffered body bytes',async()=>{
  const f=fixture({response:'HTTP/1.1 200 OK\r\nContent-Length: 999999\r\nContent-Encoding: gzip\r\n\r\n'});await createNativeDenoHttpsTransport({runtime:f.runtime}).probeRuntime!();assert.equal(f.reads(),1);assert.equal(f.tlsClosed(),1);
  const bad=fixture({response:'HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\nx'});await assert.rejects(createNativeDenoHttpsTransport({runtime:bad.runtime}).probeRuntime!(),reason('network_error','headers'));
});
const now=1700000000000,ts=String(now/1000),nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',token=base64Encode(new Uint8Array(32).fill(21)),key=base64Encode(new Uint8Array(32).fill(31));
async function authRequest(probe=true,valid=true){return new Request('https://project.supabase.co/functions/v1/support-event-delivery'+(probe?'?probe=pinning':''),{method:'POST',body:'{}',headers:{'content-type':'application/json','x-sintagma-events-timestamp':ts,'x-sintagma-events-nonce':nonce,'x-sintagma-events-signature':valid?await(probe?signProbe:signWake)(ts,nonce,token):'0'.repeat(64)}});}
test('only authenticated native probe exposes bounded implementation and phase; wake and anonymous remain redacted',async()=>{
  const calls:string[]=[],config:RuntimeConfig={enabled:false,encryptionKey:{key_base64:key},workerToken:token};
  const client:RpcClient={async rpc(name){calls.push(name);return{data:name.endsWith('_runtime_config')?config:true,error:null};}};
  const error=new NativeHttpsTransportError('tls_failed','handshake');
  const transport:PinnedHttpsTransport={implementation:'deno-native-http1',assertReady(){throw error;},async post(){throw error;},async probeRuntime(){throw error;}};
  const handler=createWorkerHttpHandler({client,env:()=>undefined,transport,now:()=>now});
  assert.deepEqual(await(await handler(await authRequest())).json(),{error:'tls_failed',implementation:'deno-native-http1',phase:'handshake'});
  assert.deepEqual(await(await handler(await authRequest(true,false))).json(),{error:'unauthorized'});config.enabled=true;
  assert.deepEqual(await(await handler(await authRequest(false))).json(),{error:'tls_failed'});
  config.enabled=false;transport.probeRuntime=async()=>({status:403,implementation:'deno-native-http1'});
  assert.deepEqual(await(await handler(await authRequest())).json(),{probe:'pinning',observed:true,httpStatus:403,deliveryEnabled:false,readinessMarker:false,implementation:'deno-native-http1',nativeReadinessMarker:false});
  const nodeHandler=createWorkerHttpHandler({client,env:()=>undefined,now:()=>now,transport:{implementation:'node-https',assertReady(){},async post(){throw new Error('unused');},async probeRuntime(){throw new CallbackTransportError('network_error');}}});
  assert.deepEqual(await(await nodeHandler(await authRequest())).json(),{error:'network_error',implementation:'node-https'});
});
