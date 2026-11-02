import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { base64Encode, createSecretCrypto, secretAad, validateWebhookSecret, constantTimeTextEqual } from './crypto.ts';
import { CallbackTransportError, canonicalizeCallback, createPinnedHttpsTransport, isPublicAddress, type PinnedHttpsTransport, type TransportDependencies } from './pinned-https.ts';
import { CallbackEndpointError, createCallbackVerifier, signWebhook } from './webhooks.ts';
import { createDeliveryWorker, createRpcDeliveryStore, outcomeForStatus, type DeliveryLease, type PreparedDelivery, type DeliveryStore } from './delivery.ts';

const encoder = new TextEncoder();
const secret = 'whsec_' + base64Encode(new Uint8Array(32).fill(7));
const previous = 'whsec_' + base64Encode(new Uint8Array(24).fill(4));
const appKey = base64Encode(new Uint8Array(32).fill(9));
const callback = 'https://receiver.openai.com/events/private-callback';
const sub = 'sub_' + '1'.repeat(64);
const workerId = '22222222-2222-4222-8222-222222222222';
const binding = { owner_user_id: '33333333-3333-4333-8333-333333333333', oauth_client_id: 'client-one', event_name: 'support.problem_report.created', callback_url: callback };
function safeError(error: unknown) {
  assert.ok(error instanceof Error); assert.ok(!String(error).includes(secret)); assert.ok(!String(error).includes(callback)); assert.ok(!String(error).includes(appKey)); return true;
}

test('strict webhook secrets accept canonical 24–64 byte base64 only', () => {
  for (const n of [24,32,64]) assert.equal(validateWebhookSecret('whsec_' + base64Encode(new Uint8Array(n))).length,n);
  for (const value of ['x','whsec_','whsec_' + base64Encode(new Uint8Array(23)),'whsec_' + base64Encode(new Uint8Array(65)),secret+'\n',secret.slice(0,-1),secret.replace('=', '_'),'whsec_Zh==']) assert.throws(() => validateWebhookSecret(value),safeError);
});
test('AES-GCM round trip binds owner, OAuth client, event and exact URL', async () => {
  const crypto = await createSecretCrypto(appKey); const aad = secretAad(binding); const envelope = await crypto.encryptSecret(secret,aad);
  assert.match(envelope.kid,/^mcp_[a-f0-9]{32}$/); assert.equal(await crypto.decryptSecret(envelope,aad),secret);
  for (const key of ['owner_user_id','oauth_client_id','event_name','callback_url'] as const) await assert.rejects(crypto.decryptSecret(envelope,secretAad({...binding,[key]:binding[key]+'-different'})),safeError);
  await assert.rejects(crypto.decryptSecret({...envelope,kid:'other'},aad),safeError);
  await assert.rejects(crypto.decryptSecret({...envelope,ciphertext:envelope.ciphertext.slice(0,-4)+'AAAA'},aad),safeError);
  await assert.rejects(crypto.decryptSecret({...envelope,extra:1} as typeof envelope,aad),safeError);
  await assert.rejects(createSecretCrypto(base64Encode(new Uint8Array(31))),safeError);
});
test('encryption uses a fresh IV and SHA key ID is stable across factories', async () => {
  const a=await createSecretCrypto(appKey),b=await createSecretCrypto(appKey);
  const x=await a.encryptSecret(secret,secretAad(binding)),y=await b.encryptSecret(secret,secretAad(binding));
  assert.equal(a.kid,b.kid);assert.notEqual(x.iv,y.iv);assert.notEqual(x.ciphertext,y.ciphertext);
  assert.match(await a.hashSecret(secret),/^[a-f0-9]{64}$/);
});
test('constant-time comparison handles different contents and lengths safely',async()=>{
  assert.equal(await constantTimeTextEqual('abcdef','abcdef'),true);assert.equal(await constantTimeTextEqual('abcdef','abcdeg'),false);assert.equal(await constantTimeTextEqual('abcdef','abc'),false);
});
test('Standard Webhooks HMAC covers the exact raw byte buffer',async()=>{
  const body=encoder.encode('{ "data": "ёж", "eventId":"evt_1" }');
  const h=await signWebhook({eventId:'evt_1',subscriptionId:sub,body,secret,signedAt:1700000000123});
  const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update('evt_1.1700000000.').update(body).digest('base64');
  assert.equal(h['webhook-signature'],'v1,'+expected);assert.equal(h['webhook-timestamp'],'1700000000');
  const changed=await signWebhook({eventId:'evt_1',subscriptionId:sub,body:encoder.encode(JSON.stringify(JSON.parse(new TextDecoder().decode(body)))),secret,signedAt:1700000000123});assert.notEqual(changed['webhook-signature'],h['webhook-signature']);
});
test('rotation emits two space-separated v1 signatures for at most 120 seconds',async()=>{
  const input={eventId:'evt_rotate',subscriptionId:sub,body:encoder.encode('{}'),secret,signedAt:1700000000000,previousSecret:previous};
  assert.equal((await signWebhook({...input,previousValidUntil:new Date(input.signedAt+120000).toISOString()}))['webhook-signature'].split(' ').length,2);
  for (const delta of [0,-1,120001]) assert.equal((await signWebhook({...input,previousValidUntil:new Date(input.signedAt+delta).toISOString()}))['webhook-signature'].split(' ').length,1);
  assert.notEqual((await signWebhook(input))['webhook-signature'],(await signWebhook({...input,signedAt:input.signedAt+1000}))['webhook-signature']);
});
test('canonical callback syntax rejects credentials, fragment, non-HTTPS, ports and literal hosts',()=>{
  assert.equal(canonicalizeCallback('https://receiver.openai.com:443/events'), 'https://receiver.openai.com/events');
  for(const u of ['http://receiver.openai.com/e','https://u:p@receiver.openai.com/e','https://receiver.openai.com/e#','https://receiver.openai.com:8443/e','https://127.0.0.1/','https://8.8.8.8/','https://[2606:4700:4700::1111]/','https://localhost/','https://host.local/e','https://receiver.openai.com./','https://receiver.openai.com\\@127.0.0.1/']) assert.throws(()=>canonicalizeCallback(u),safeError);
});
test('public-address guard rejects special IPv4 and IPv6 ranges and transition encodings',()=>{
  for(const ip of ['8.8.8.8','1.1.1.1','9.9.9.9','2606:4700:4700::1111','2001:4860:4860::8888']) assert.equal(isPublicAddress(ip),true,ip);
  for(const ip of ['0.0.0.0','10.1.2.3','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.0.0.9','192.0.2.1','192.88.99.1','192.168.1.1','198.18.0.1','198.51.100.1','203.0.113.2','224.0.0.1','255.255.255.255','::','::1','::ffff:8.8.8.8','::ffff:127.0.0.1','64:ff9b::808:808','64:ff9b:1::1','100::1','2001::1','2001:2::1','2001:db8::1','2002:808:808::1','fc00::1','fe80::1','ff02::1','3fff::1','bad']) assert.equal(isPublicAddress(ip),false,ip);
});

type FakeOptions={status?:number;chunks?:Uint8Array[];hang?:boolean;noLookup?:boolean;noIdentity?:boolean;remote?:string;authorized?:boolean};
function fakeHttps(config:FakeOptions={}) {
  const calls:{options:Record<string,unknown>;body?:Uint8Array;destroyed?:boolean}[]=[];
  const request=((options:Record<string,any>,callbackFn:(res:any)=>void)=>{
    const record={options} as typeof calls[number];calls.push(record);
    const req=new EventEmitter() as EventEmitter&{end:(b:Uint8Array)=>void;destroy:()=>void};
    req.destroy=()=>{record.destroyed=true;};
    req.end=(body)=>{record.body=Uint8Array.from(body);queueMicrotask(()=>{
      if(record.destroyed)return;const res=new EventEmitter()as any;res.statusCode=config.status??204;res.destroy=()=>{};callbackFn(res);
      for(const chunk of config.chunks??[])res.emit('data',chunk);if(!config.hang)res.emit('end');
    });};
    queueMicrotask(()=>{
      let address='8.8.8.8';if(!config.noLookup)(options.lookup as Function)(options.hostname,{},(_e:unknown,a:string)=>{address=a;});
      if(!config.noIdentity)(options.checkServerIdentity as Function)(options.hostname,{});
      const socket=new EventEmitter()as any;socket.authorized=config.authorized??true;socket.remoteAddress=config.remote??address;
      req.emit('socket',socket);queueMicrotask(()=>socket.emit('secureConnect'));
    });return req;
  }) as unknown as NonNullable<TransportDependencies['request']>;
  return{calls,request};
}
test('each POST freshly resolves all DNS records and pins the validated actual connection',async()=>{
  let lookups=0;const fake=fakeHttps();let checked='';
  const t=createPinnedHttpsTransport({resolve:async()=>{lookups++;return[{address:lookups===1?'8.8.8.8':'1.1.1.1',family:4}];},request:fake.request,identityCheck:(host)=>{checked=host;return undefined;}});
  for(let i=0;i<2;i++)assert.equal((await t.post({url:callback,headers:{'Content-Type':'application/json'},body:encoder.encode('{}')})).status,204);
  assert.equal(lookups,2);assert.equal(fake.calls.length,2);assert.equal(checked,'receiver.openai.com');
  const o=fake.calls[0].options;assert.equal(o.hostname,'receiver.openai.com');assert.equal(o.servername,'receiver.openai.com');assert.equal(o.port,443);assert.equal(o.agent,false);assert.equal(o.autoSelectFamily,false);assert.equal(o.rejectUnauthorized,true);assert.equal(o.family,4);assert.ok(fake.calls.every(x=>x.body?.length===2));
});
test('a private address anywhere in a DNS result blocks the entire connection',async()=>{
  const fake=fakeHttps();const t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],request:fake.request});
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='destination_not_public'&&safeError(e));assert.equal(fake.calls.length,0);
});
test('DNS rebinding to a private answer on the next attempt cannot reuse a prior public socket',async()=>{
  let attempt=0;const fake=fakeHttps();const t=createPinnedHttpsTransport({resolve:async()=>[{address:++attempt===1?'8.8.8.8':'127.0.0.1',family:4}],request:fake.request,identityCheck:()=>undefined});
  await t.post({url:callback,headers:{},body:encoder.encode('{}')});await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='destination_not_public');assert.equal(fake.calls.length,1);assert.equal(attempt,2);
});
test('temporary DNS failure is categorized separately from a nonexistent destination',async()=>{
  for(const [code,reason]of [['EAI_AGAIN','network_error'],['ENOTFOUND','dns_failed']]as const){const t=createPinnedHttpsTransport({resolve:async()=>{throw Object.assign(new Error('redacted'),{code});}});await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason===reason);}
});
for(const config of [{noLookup:true},{noIdentity:true},{remote:'127.0.0.1'},{authorized:false}])test('no body is sent when lookup, TLS identity or actual socket pin is not honored '+JSON.stringify(config),async()=>{
  const fake=fakeHttps(config),t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4}],request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='pinning_failed');assert.equal(fake.calls[0].body,undefined);
});
test('redirect is blocked without a second connection or a Location request',async()=>{
  const fake=fakeHttps({status:302});const t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4}],request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='redirect_blocked'&&e.httpStatus===302);assert.equal(fake.calls.length,1);
});
test('request and response byte budgets are enforced before unbounded allocation',async()=>{
  const fake=fakeHttps({status:200,chunks:[new Uint8Array(4097)]});const t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4}],request:fake.request,identityCheck:()=>undefined});
  await assert.rejects(t.post({url:callback,headers:{},body:new Uint8Array(262145)}),(e)=>e instanceof CallbackTransportError&&e.reason==='payload_too_large');assert.equal(fake.calls.length,0);
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}'),responseLimitBytes:4096}),(e)=>e instanceof CallbackTransportError&&e.reason==='response_too_large'&&e.httpStatus===200);assert.equal(fake.calls[0].destroyed,true);
});
test('one deadline covers stalled DNS, with no connection after late resolution',async()=>{
  let finish!: (x:{address:string;family:4}[])=>void;const fake=fakeHttps();const t=createPinnedHttpsTransport({resolve:()=>new Promise(r=>{finish=r;}),request:fake.request,timeoutMs:15});
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='timeout');finish([{address:'8.8.8.8',family:4}]);await new Promise(r=>setTimeout(r,5));assert.equal(fake.calls.length,0);
});
test('deadline covers the response body, including a server that never ends it',async()=>{
  const fake=fakeHttps({status:200,hang:true});const t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4}],request:fake.request,identityCheck:()=>undefined,timeoutMs:15});
  await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),(e)=>e instanceof CallbackTransportError&&e.reason==='timeout');assert.equal(fake.calls[0].destroyed,true);
});
test('unproven Deno Node-HTTPS compatibility fails closed before DNS',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'Deno');let calls=0;
  try{Object.defineProperty(globalThis,'Deno',{configurable:true,value:{}});const t=createPinnedHttpsTransport({resolve:async()=>{calls++;return[];}});assert.throws(()=>t.assertReady(),(e)=>e instanceof CallbackTransportError&&e.reason==='runtime_not_proven');await assert.rejects(t.post({url:callback,headers:{},body:encoder.encode('{}')}),safeError);assert.equal(calls,0);}
  finally{if(original)Object.defineProperty(globalThis,'Deno',original);else delete(globalThis as{Deno?:unknown}).Deno;}
});

function echoTransport(onPost?:(body:any,headers:Record<string,string>)=>{status?:number;echo?:string;bytes?:Uint8Array}):PinnedHttpsTransport&{calls:any[]} {
  const calls:any[]=[];return{calls,assertReady(){},async post(input){const body=JSON.parse(new TextDecoder().decode(input.body));calls.push({body,headers:input.headers});const cfg=onPost?.(body,input.headers)??{};return{status:cfg.status??200,body:cfg.bytes??encoder.encode(JSON.stringify({challenge:cfg.echo??body.challenge}))};}};
}
test('verification uses a signed fresh 32-byte single-use challenge and exact echo',async()=>{
  const t=echoTransport();const verify=createCallbackVerifier({transport:t,cacheTtlMs:0});const input={url:callback,secret,subscriptionId:sub,principalKey:'owner/client'};await verify(input);await verify(input);
  assert.equal(t.calls.length,2);assert.notEqual(t.calls[0].body.challenge,t.calls[1].body.challenge);assert.match(t.calls[0].body.challenge,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(t.calls[0].headers['webhook-id'],t.calls[1].headers['webhook-id']);assert.match(t.calls[0].headers['webhook-signature'],/^v1,/);assert.equal(t.calls[0].headers['X-MCP-Subscription-Id'],sub);
});
test('verification cache separates principal, URL and secret hash and expires in five minutes',async()=>{
  let clock=1700000000000;const t=echoTransport();const verify=createCallbackVerifier({transport:t,now:()=>clock,maxCacheEntries:2});const input={url:callback,secret,subscriptionId:sub,principalKey:'one'};
  await verify(input);await verify(input);assert.equal(t.calls.length,1);await verify({...input,secret:previous});await verify({...input,principalKey:'two'});assert.equal(t.calls.length,3);await verify(input);assert.equal(t.calls.length,4);clock+=300000;await verify(input);assert.equal(t.calls.length,5);await verify({...input,url:callback+'2'});assert.equal(t.calls.length,6);
});
for(const kind of ['wrong','non2xx','oversize','expired','malformed'])test('verification refuses '+kind+' without caching success',async()=>{
  let clock=1700000000000;const t=echoTransport((body)=>{
    if(kind==='wrong')return{echo:body.challenge+'x'};if(kind==='non2xx')return{status:410};if(kind==='oversize')return{bytes:new Uint8Array(4097)};if(kind==='expired'){clock+=10001;return{};}return{bytes:encoder.encode('{')};
  });const verify=createCallbackVerifier({transport:t,now:()=>clock});const input={url:callback,secret,subscriptionId:sub,principalKey:'p'};await assert.rejects(verify(input),(e)=>e instanceof CallbackEndpointError&&safeError(e));await assert.rejects(verify(input),safeError);assert.equal(t.calls.length,2);
});

async function workerFixture(status=204){
  let clock=1700000000000;const crypto=await createSecretCrypto(appKey);const lease:DeliveryLease={job_id:'44444444-4444-4444-8444-444444444444',lease_token:'55555555-5555-4555-8555-555555555555',fence:1,attempt_no:1,lease_expires_at:new Date(clock+60000).toISOString()};
  const job:PreparedDelivery={...binding,job_id:lease.job_id,subscription_id:sub,secret_envelope:await crypto.encryptSecret(secret,secretAad(binding)),previous_secret_envelope:null,previous_valid_until:null,event:{eventId:'evt_stable',name:binding.event_name,timestamp:new Date(clock-10000).toISOString(),data:{source_kind:'problem_report',source_id:'66666666-6666-4666-8666-666666666666',message_id:null,organization_id:null},cursor:null}};
  const finishes:any[]=[];const posts:any[]=[];let prepareReturns:PreparedDelivery|null=job;let ready=true;
  const store:DeliveryStore={async claim(){return[lease];},async prepare(){return prepareReturns;},async finish(l,o,s){finishes.push({lease:{...l},outcome:o,status:s});return true;}};
  const transport:PinnedHttpsTransport={assertReady(){if(!ready)throw new CallbackTransportError('runtime_not_proven');},async post(input){posts.push(input);return{status,body:new Uint8Array()};}};
  const worker=createDeliveryWorker({store,crypto,transport,now:()=>clock});return{worker,store,transport,crypto,lease,job,posts,finishes,clock:(value:number)=>{clock=value;},cancel:()=>{prepareReturns=null;},notReady:()=>{ready=false;}};
}
test('retry preserves occurrence and event ID but refreshes signing time, and does not loop locally',async()=>{
  const f=await workerFixture(503);assert.equal((await f.worker.runOnce(workerId)).retried,1);f.clock(1700000001000);f.lease.attempt_no=2;assert.equal((await f.worker.runOnce(workerId)).retried,1);
  assert.equal(f.posts.length,2);assert.deepEqual(f.posts[0].body,f.posts[1].body);assert.equal(f.posts[0].headers['webhook-id'],'evt_stable');assert.notEqual(f.posts[0].headers['webhook-timestamp'],f.posts[1].headers['webhook-timestamp']);assert.ok(f.finishes.every(x=>x.lease.fence===1&&x.lease.lease_token===f.lease.lease_token));
});
for(const [status,outcome]of [[200,'accepted'],[204,'accepted'],[302,'permanent'],[400,'permanent'],[401,'permanent'],[408,'retry'],[410,'gone'],[413,'too_large'],[425,'retry'],[429,'retry'],[500,'retry'],[503,'retry']]as const)test('delivery outcome '+status+' is '+outcome,async()=>{
  const f=await workerFixture(status);await f.worker.runOnce(workerId);assert.deepEqual(f.finishes.map(x=>[x.outcome,x.status]),[[outcome,status]]);assert.equal(outcomeForStatus(status),outcome);
});
test('prepare rechecks revocation and suppresses HTTP and finish for a stale job',async()=>{
  const f=await workerFixture();f.cancel();assert.equal((await f.worker.runOnce(workerId)).stale,1);assert.equal(f.posts.length,0);assert.equal(f.finishes.length,0);
});
test('worker fails closed before claiming when runtime pinning is unproven',async()=>{
  const f=await workerFixture();f.notReady();let claimed=0;f.store.claim=async()=>{claimed++;return[f.lease];};await assert.rejects(f.worker.runOnce(workerId),safeError);assert.equal(claimed,0);
});
test('worker never sends with expired or insufficient lease time',async()=>{
  const f=await workerFixture();f.clock(1700000060000);assert.equal((await f.worker.runOnce(workerId)).stale,1);assert.equal(f.posts.length,0);f.clock(1700000050000);assert.equal((await f.worker.runOnce(workerId)).retried,1);assert.equal(f.posts.length,0);
});
test('stored-secret AAD mismatch is a redacted permanent local failure without fake HTTP status',async()=>{
  const f=await workerFixture();f.job.owner_user_id='different-owner';assert.equal((await f.worker.runOnce(workerId)).dead,1);assert.equal(f.posts.length,0);assert.deepEqual(f.finishes.map(x=>[x.outcome,x.status]),[['permanent',null]]);
});
test('unexpected or oversized support content is not sent and no synthetic HTTP 413 is invented',async()=>{
  const f=await workerFixture();f.job.event.data.large='x'.repeat(262144);assert.equal((await f.worker.runOnce(workerId)).dead,1);assert.equal(f.posts.length,0);assert.equal(f.finishes[0].status,null);
});
test('fixed data-free readiness probe uses HEAD and does not enable the delivery marker',async()=>{
  const fake=fakeHttps({status:200}),t=createPinnedHttpsTransport({resolve:async()=>[{address:'8.8.8.8',family:4}],request:fake.request,identityCheck:()=>undefined});
  assert.equal((await t.probeRuntime!()).status,200);const o=fake.calls[0].options;
  assert.equal(o.method,'HEAD');assert.equal(o.hostname,'developers.openai.com');assert.equal(o.path,'/plugins/build/mcp-events');assert.equal(fake.calls[0].body!.byteLength,0);
  assert.equal((o.headers as Record<string,string>)['webhook-signature'],undefined);
});
test('unsafe stored callback is not sent even when database storage was compromised',async()=>{
  const f=await workerFixture();f.job.callback_url='http://127.0.0.1/';await f.worker.runOnce(workerId);assert.equal(f.posts.length,0);assert.equal(f.finishes[0].outcome,'permanent');
});
test('RPC adapter preserves fencing arguments and hides database error content',async()=>{
  const calls:any[]=[];const f=await workerFixture();const store=createRpcDeliveryStore({async rpc(name,args){calls.push({name,args});return{data:name.endsWith('_claim')?[f.lease]:name.endsWith('_prepare_delivery')?f.job:true,error:null};}});
  const claimed=await store.claim(workerId,3,60);await store.prepare(claimed[0]);await store.finish(claimed[0],'accepted',204);assert.deepEqual(calls[2].args,{p_job_id:f.lease.job_id,p_lease_token:f.lease.lease_token,p_fence:1,p_outcome:'accepted',p_http_status:204});
  const bad=createRpcDeliveryStore({async rpc(){return{data:null,error:{message:secret+' '+callback}};}});await assert.rejects(bad.claim(workerId,1,60),safeError);
});
