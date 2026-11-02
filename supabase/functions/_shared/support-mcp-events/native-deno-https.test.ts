import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createNativeDenoHttpsTransport,DENO_NATIVE_HTTPS_PINNING_PROVEN,type NativeDenoRuntime,type NativeConn,type NativeTlsConn} from './native-deno-https.ts';
import {createPinnedHttpsTransport,DENO_NODE_HTTPS_PINNING_PROVEN,NativeHttpsTransportError,CallbackTransportError,type PinnedHttpsTransport} from './pinned-https.ts';
import {base64Encode} from './crypto.ts';
import {createWorkerHttpHandler,signProbe,signWake,type RuntimeConfig} from './worker-http.ts';
import type {RpcClient} from './delivery.ts';
import {createCallbackVerifier,CallbackEndpointError} from './webhooks.ts';
const encoder=new TextEncoder();
const public4={transport:'tcp',hostname:'8.8.8.8',port:443};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
type Stage='dns'|'connect'|'tls'|'handshake'|'write'|'read';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
type Settings={A?:string[];AAAA?:string[];dnsError?:Partial<Record<'A'|'AAAA',Error>>;rawRemote?:unknown;tlsRemote?:unknown;alpn?:unknown;status?:number;response?:string;responseFromRequest?:(wire:Uint8Array)=>Uint8Array;stallBodyWrite?:boolean;partial?:number;stall?:Stage;fail?:Stage;fragment?:number};
function fixture(settings:Settings={}){
  const order:string[]=[],writes:Uint8Array[]=[],dns:{host:string;rr:string;signal?:AbortSignal}[]=[],connectOptions:unknown[]=[],tlsOptions:unknown[]=[];
  let rawClosed=0,tlsClosed=0,reads=0,offset=0,wrapped=false,responseBuilt=false,writeStart=0;
  let response=encoder.encode(settings.response??`HTTP/1.1 ${settings.status??403} Response\r\nContent-Length: 12345\r\n\r\n`);
  const rawGate=deferred<NativeConn>(),tlsGate=deferred<NativeTlsConn>();
  const raw:NativeConn={get remoteAddr(){order.push('rawPin');return settings.rawRemote??public4;},async read(){throw Error('raw read forbidden');},async write(){throw Error('raw write forbidden');},close(){rawClosed++;order.push('rawClose');}};
  const tls:NativeTlsConn={get remoteAddr(){order.push('tlsPin');return settings.tlsRemote??settings.rawRemote??public4;},
    async handshake(){order.push('handshake');if(settings.fail==='handshake')throw Error('secret handshake detail');if(settings.stall==='handshake')return new Promise(()=>{});return{alpnProtocol:settings.alpn===undefined?'http/1.1':settings.alpn as string|null};},
    async read(buffer){order.push('read');reads++;if(settings.fail==='read')throw Error('unsafe TLS read detail');if(settings.stall==='read')return new Promise(()=>{});if(!responseBuilt&&settings.responseFromRequest){response=settings.responseFromRequest(Buffer.concat(writes.slice(writeStart).map(bytes=>Buffer.from(bytes))));responseBuilt=true;}if(offset===response.length)return null;const n=Math.min(buffer.length,settings.fragment??buffer.length,response.length-offset);buffer.set(response.subarray(offset,offset+n));offset+=n;return n;},
    async write(buffer){order.push('write');if(settings.fail==='write')throw Error('unsafe TLS write detail');if(settings.stall==='write'||settings.stallBodyWrite&&Buffer.concat(writes.slice(writeStart).map(bytes=>Buffer.from(bytes))).includes(Buffer.from('\r\n\r\n')))return new Promise(()=>{});const n=Math.min(buffer.length,settings.partial??buffer.length);writes.push(Uint8Array.from(buffer.subarray(0,n)));return n;},close(){tlsClosed++;order.push('tlsClose');},
  };
  const runtime:NativeDenoRuntime={async resolveDns(host,rr,options){order.push('dns:'+rr);dns.push({host,rr,signal:options?.signal});if(settings.fail==='dns')throw Error('unsafe DNS detail');if(settings.stall==='dns')return new Promise(()=>{});if(settings.dnsError?.[rr])throw settings.dnsError[rr];return rr==='A'?(settings.A??['8.8.8.8']):(settings.AAAA??['2606:4700:4700::1111']);},
    async connect(options){order.push('connect');connectOptions.push(options);offset=0;responseBuilt=false;writeStart=writes.length;if(settings.fail==='connect')throw Error('secret connect detail');if(settings.stall==='connect')return rawGate.promise;return raw;},
    async startTls(connection,options){order.push('startTls');assert.equal(connection,raw);wrapped=true;tlsOptions.push(options);if(settings.fail==='tls')throw Error('secret TLS detail');if(settings.stall==='tls')return tlsGate.promise;return tls;},
  };
  return{runtime,raw,tls,order,writes,dns,connectOptions,tlsOptions,lateRaw:()=>rawGate.resolve(raw),lateTls:()=>tlsGate.resolve(tls),rawClosed:()=>rawClosed,tlsClosed:()=>tlsClosed,reads:()=>reads,wrapped:()=>wrapped};
}
function reason(expected:string,phase?:string){return(error:unknown)=>error instanceof NativeHttpsTransportError&&error.reason===expected&&(!phase||error.phase===phase)&&error.message===expected;}
for(const status of [200,403,503])test('native fixed HEAD '+status+' uses literal TCP, original TLS hostname, explicit handshake and closes',async()=>{
  const f=fixture({status,partial:3,fragment:1}),transport=createNativeDenoHttpsTransport({runtime:f.runtime});
  const pinned={shape:'object',transport:'tcp',public:true,ipEqual:true,portMatch:true};
  assert.deepEqual(await transport.probeRuntime!(),{status,implementation:'deno-native-http1',pinDiagnostics:{raw:pinned,tls:pinned}});
  assert.deepEqual(f.connectOptions,[{hostname:'8.8.8.8',port:443,transport:'tcp'}]);assert.deepEqual(f.tlsOptions,[{hostname:'developers.openai.com',alpnProtocols:['http/1.1']}]);
  assert.deepEqual(f.order.slice(0,7),['dns:A','dns:AAAA','connect','rawPin','startTls','handshake','tlsPin']);
  const bytes=Buffer.concat(f.writes.map(b=>Buffer.from(b))).toString('utf8');
  assert.equal(bytes,'HEAD /plugins/build/mcp-events HTTP/1.1\r\nHost: developers.openai.com\r\nConnection: close\r\nContent-Length: 0\r\nAccept-Encoding: identity\r\n\r\n');
  assert.equal(f.rawClosed(),0);assert.equal(f.tlsClosed(),1);assert.ok(f.dns.every(d=>d.signal?.aborted));
  assert.equal(DENO_NATIVE_HTTPS_PINNING_PROVEN,true);assert.equal(DENO_NODE_HTTPS_PINNING_PROVEN,false);
});
test('native readiness still fails before DNS without complete runtime APIs',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Deno');
  try{Object.defineProperty(globalThis,'Deno',{value:{},configurable:true});const transport=createNativeDenoHttpsTransport();assert.throws(()=>transport.assertReady(),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');await assert.rejects(transport.post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{}}),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');}
  finally{if(descriptor)Object.defineProperty(globalThis,'Deno',descriptor);else delete(globalThis as {Deno?:unknown}).Deno;}
  for(const name of ['resolveDns','connect','startTls']){const f=fixture();Reflect.deleteProperty(f.runtime,name);const transport=createNativeDenoHttpsTransport({runtime:f.runtime});assert.throws(()=>transport.assertReady(),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');await assert.rejects(transport.post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{}}),e=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');assert.deepEqual(f.order,[]);}
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
  assert.deepEqual(await(await handler(await authRequest())).json(),{probe:'pinning',observed:true,httpStatus:403,deliveryEnabled:false,readinessMarker:false,implementation:'deno-native-http1',nativeReadinessMarker:true});
  const nodeHandler=createWorkerHttpHandler({client,env:()=>undefined,now:()=>now,transport:{implementation:'node-https',assertReady(){},async post(){throw new Error('unused');},async probeRuntime(){throw new CallbackTransportError('network_error');}}});
  assert.deepEqual(await(await nodeHandler(await authRequest())).json(),{error:'network_error',implementation:'node-https'});
});

function requestParts(wire:Uint8Array){
  const bytes=Buffer.from(wire),end=bytes.indexOf('\r\n\r\n');assert.ok(end>=0);
  const lines=bytes.subarray(0,end).toString('ascii').split('\r\n'),requestLine=lines.shift()!;
  const headers=Object.fromEntries(lines.map(line=>{const colon=line.indexOf(':');return[line.slice(0,colon).toLowerCase(),line.slice(colon+1).trim()];}));
  return{requestLine,headers,body:Uint8Array.from(bytes.subarray(end+4))};
}
function jsonResponse(status:number,data:unknown):Uint8Array{
  const body=encoder.encode(JSON.stringify(data)),header=encoder.encode(`HTTP/1.1 ${status} Response\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n`),wire=new Uint8Array(header.length+body.length);wire.set(header);wire.set(body,header.length);return wire;
}
test('reviewed native POST preserves exact UTF8 bytes through partial writes and returns no pin metadata',async()=>{
  const body=encoder.encode('{ "value": "\u044F\uD83D\uDE80" }'),before=Uint8Array.from(body),f=fixture({partial:3,response:'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}'}),transport=createNativeDenoHttpsTransport({runtime:f.runtime});
  assert.equal(Buffer.from(body).includes(Buffer.from([0xd1,0x8f,0xf0,0x9f,0x9a,0x80])),true);
  transport.assertReady();const result=await transport.post({url:'https://receiver.openai.com/events?q=1',body,headers:{'Content-Type':'application/json','webhook-id':'evt_synthetic'}});
  const sent=requestParts(Buffer.concat(f.writes.map(bytes=>Buffer.from(bytes))));assert.equal(sent.requestLine,'POST /events?q=1 HTTP/1.1');assert.equal(sent.headers.host,'receiver.openai.com');assert.equal(sent.headers['content-length'],String(body.byteLength));assert.deepEqual(sent.body,before);assert.deepEqual(body,before);assert.deepEqual(result,{status:200,body:encoder.encode('{}')});assert.equal(f.tlsClosed(),1);assert.equal(f.order.filter(item=>item==='write').length>2,true);
});
test('real callback verifier signs a fresh challenge and sends it through native POST with original TLS host',async()=>{
  const secret='whsec_'+base64Encode(new Uint8Array(32).fill(17)),subscriptionId='sub_'+'1'.repeat(64);let verified=0;
  const f=fixture({partial:5,responseFromRequest:wire=>{
    const request=requestParts(wire),body=JSON.parse(new TextDecoder().decode(request.body));assert.equal(request.requestLine,'POST /events HTTP/1.1');assert.equal(body.type,'verification');assert.match(body.challenge,/^[A-Za-z0-9_-]{43}$/);assert.equal(request.headers['x-mcp-subscription-id'],subscriptionId);assert.equal(request.headers['webhook-timestamp'],'1700000000');
    const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(request.headers['webhook-id']+'.'+request.headers['webhook-timestamp']+'.').update(request.body).digest('base64');assert.equal(request.headers['webhook-signature'],'v1,'+expected);verified++;return jsonResponse(200,{challenge:body.challenge});
  }});
  await createCallbackVerifier({transport:createNativeDenoHttpsTransport({runtime:f.runtime}),now:()=>1700000000000,cacheTtlMs:0})({url:'https://receiver.openai.com/events',secret,subscriptionId,principalKey:'synthetic-owner/client'});
  assert.equal(verified,1);assert.deepEqual(f.tlsOptions,[{hostname:'receiver.openai.com',alpnProtocols:['http/1.1']}]);assert.equal(f.tlsClosed(),1);
});
test('native callback POST still requires 2xx and exact challenge echo',async()=>{
  for(const mode of ['403','503','wrong_echo']){const f=fixture({responseFromRequest:wire=>{const body=JSON.parse(new TextDecoder().decode(requestParts(wire).body));return jsonResponse(mode==='wrong_echo'?200:Number(mode),{challenge:body.challenge+(mode==='wrong_echo'?'wrong':'')});}});
    await assert.rejects(createCallbackVerifier({transport:createNativeDenoHttpsTransport({runtime:f.runtime}),cacheTtlMs:0})({url:'https://receiver.openai.com/events',secret:'whsec_'+base64Encode(new Uint8Array(32).fill(17)),subscriptionId:'sub_'+'1'.repeat(64),principalKey:'synthetic-owner/client'}),e=>e instanceof CallbackEndpointError&&e.reason==='challenge_failed');assert.equal(f.tlsClosed(),1);}
});
test('native POST never writes HTTP before verified TLS and exact public-IP/443 gates',async()=>{
  for(const settings of [{fail:'handshake' as const},{tlsRemote:{hostname:'1.1.1.1',port:443}},{tlsRemote:{hostname:'8.8.8.8',port:8443}}]){const f=fixture(settings);await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{}}),e=>e instanceof NativeHttpsTransportError&&['tls_failed','pinning_failed'].includes(e.reason));assert.equal(f.writes.length,0);}
});
test('native POST body-write deadline and caller abort close the active connection',async()=>{
  for(const abort of [false,true]){const controller=new AbortController(),f=fixture({stallBodyWrite:true}),transport=createNativeDenoHttpsTransport({runtime:f.runtime,timeoutMs:15}),pending=transport.post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{},signal:controller.signal});if(abort){await tick();controller.abort();}await assert.rejects(pending,reason('timeout','write'));assert.equal(f.tlsClosed(),1);assert.equal(requestParts(Buffer.concat(f.writes.map(bytes=>Buffer.from(bytes)))).body.length,0);}
});
test('native POST enforces payload and decoded response budgets through the real transport',async()=>{
  const oversized=fixture();await assert.rejects(createNativeDenoHttpsTransport({runtime:oversized.runtime}).post({url:'https://receiver.openai.com/events',body:new Uint8Array(262145),headers:{}}),e=>e instanceof CallbackTransportError&&e.reason==='payload_too_large');assert.equal(oversized.order.length,0);
  const f=fixture({response:'HTTP/1.1 200 OK\r\nContent-Length: 4097\r\n\r\n'+'x'.repeat(4097)});await assert.rejects(createNativeDenoHttpsTransport({runtime:f.runtime}).post({url:'https://receiver.openai.com/events',body:encoder.encode('{}'),headers:{}}),reason('response_too_large','body'));assert.equal(f.tlsClosed(),1);
});
