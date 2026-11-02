import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSupportEventsProtocol, EVENT_NAMES, EventProtocolError, type ProtocolBackend } from './protocol.ts';
import { createSecretCrypto, base64Encode, secretAad } from './crypto.ts';
import { CallbackEndpointError } from './webhooks.ts';

const owner={user_id:'33333333-3333-4333-8333-333333333333',client_id:'44444444-4444-4444-8444-444444444444',session_id:'55555555-5555-4555-8555-555555555555'};
const sub='sub_'+'a'.repeat(64),url='https://receiver.openai.com/callback',metadata='https://api.sintagma.ru/.well-known/oauth-protected-resource';
const secret='whsec_'+base64Encode(new Uint8Array(32).fill(7)),master=base64Encode(new Uint8Array(32).fill(4));
const params=()=>({name:EVENT_NAMES[0],arguments:{},delivery:{mode:'webhook',url,secret},cursor:null});
function setup(overrides:Partial<ProtocolBackend>={},fallbackOverride?:(req:Request)=>Promise<Response>){
  const calls:{name:string,args:Record<string,unknown>}[]=[],tokens:string[]=[],verifications:unknown[]=[],fallbackRequests:Request[]=[];
  const backend:ProtocolBackend={isReady:async()=>true,authenticateOriginalBearer:async token=>{tokens.push(token);return owner;},
    serviceRpc:async(name,args)=>{calls.push({name,args});if(name.endsWith('_identity'))return sub;if(name.endsWith('_subscribe_verified'))return{id:sub,refreshBefore:'2026-11-04T00:00:00Z',cursor:null,truncated:false};return{};},
    secretCrypto:()=>createSecretCrypto(master),verifyCallback:async input=>{verifications.push(input);},...overrides};
  const fallback=async(req:Request)=>{fallbackRequests.push(req);return fallbackOverride?fallbackOverride(req):new Response('original',{headers:{'X-Original':'yes'}});};
  return{handle:withSupportEventsProtocol(fallback,backend,metadata),calls,tokens,verifications,fallbackRequests};
}
function request(call:unknown,authorization:string|undefined='Bearer original-oauth-token',path='/functions/v1/mcp'){
  return new Request('https://project.supabase.co'+path,{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(call)});
}
function rpc(method:string,params?:unknown,id:string|number=1){return{jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})};}
async function result(response:Response){return await response.json() as any;}
test('original GET, OPTIONS, REST and unknown tool handlers are preserved',async()=>{
  const s=setup();for(const method of ['GET','OPTIONS'])assert.equal(await(await s.handle(new Request('https://project.supabase.co/mcp',{method}))).text(),'original');
  assert.equal(await(await s.handle(request(rpc('tools/call',{name:'get_sintagma_support_request'})))).text(),'original');
  assert.equal(await(await s.handle(request(rpc('events/list'),undefined,'/functions/v1/mcp/.mcp/invoke-tool/anything'))).text(),'original');
  assert.equal(s.fallbackRequests.length,4);assert.equal(s.calls.length,0);
});
test('large existing tool arguments, batches and malformed legacy JSON pass unchanged to SDK',async()=>{
  const s=setup({},async r=>new Response(await r.text()));
  for(const body of [JSON.stringify(rpc('tools/call',{value:'x'.repeat(50000)})),JSON.stringify([rpc('tools/list')]),'{broken']){
    const r=new Request('https://project.supabase.co/mcp',{method:'POST',body});assert.equal(await(await s.handle(r)).text(),body);
  }assert.equal(s.calls.length,0);
});
test('JSON initialize adds only events and preserves existing tools/auth/server info',async()=>{
  const original={jsonrpc:'2.0',id:17,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'existing-14-tools',version:'1'}}};
  const s=setup({},async()=>Response.json(original));const got=await result(await s.handle(request(rpc('initialize',{},17))));
  assert.deepEqual(got,{...original,result:{...original.result,capabilities:{tools:{listChanged:false},events:{}}}});assert.equal(s.tokens.length,0);
});
for(const readiness of [false,'throws'] as const)test('initialize remains original when readiness '+readiness,async()=>{
  const s=setup({isReady:async()=>{if(readiness==='throws')throw Error('private config');return readiness; }},async()=>Response.json({jsonrpc:'2.0',id:1,result:{capabilities:{tools:{}}}}));
  const got=await result(await s.handle(request(rpc('initialize'))));assert.deepEqual(got.result.capabilities,{tools:{}});
});
test('SSE initialize transforms its complete frame and retains subsequent notifications',async()=>{
  const first='event: message\r\ndata: '+JSON.stringify({jsonrpc:'2.0',id:1,result:{capabilities:{tools:{}}}})+'\r\n\r\n';
  const after='event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/message',params:{message:'Позднее сообщение ёж'}})+'\n\n';
  const bytes=new TextEncoder().encode(first+after);let i=0;
  const stream=new ReadableStream<Uint8Array>({pull(c){if(i<bytes.length)c.enqueue(bytes.slice(i,++i));else c.close();}});
  const s=setup({},async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
  const text=await(await s.handle(request(rpc('initialize')))).text();assert.ok(text.includes('"events":{}'));assert.ok(text.endsWith(after));
});
test('unmatched init ID, errors and unrelated SSE frames are preserved',async()=>{
  for(const body of [{jsonrpc:'2.0',id:2,result:{capabilities:{tools:{}}}},{jsonrpc:'2.0',id:1,error:{code:-1,message:'error'}}]){
    const s=setup({},async()=>Response.json(body));assert.deepEqual(await result(await s.handle(request(rpc('initialize')))),body);
  }
  const body=': heartbeat\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"capabilities":{"tools":{}}}}\n\n';
  const s=setup({},async()=>new Response(body,{headers:{'Content-Type':'text/event-stream'}}));assert.equal(await(await s.handle(request(rpc('initialize')))).text(),body);
});
test('SSE keeps a UTF-8 code point split immediately after the rewritten frame',async()=>{
  const first='data: '+JSON.stringify({jsonrpc:'2.0',id:1,result:{capabilities:{tools:{}}}})+'\n\n';
  const tail='data: {"message":"Ёж"}\n\n',encoder=new TextEncoder();
  const all=encoder.encode(first+tail),cut=encoder.encode(first+'data: {"message":"').length+1;
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(all.slice(0,cut));c.enqueue(all.slice(cut));c.close();}});
  const s=setup({},async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
  const text=await(await s.handle(request(rpc('initialize')))).text();assert.ok(text.endsWith(tail));assert.ok(!text.includes('\ufffd'));
});
test('disabled events are undiscoverable and cause no authentication or mutation',async()=>{
  const s=setup({isReady:async()=>false});const got=await result(await s.handle(request(rpc('events/subscribe',params()))));assert.equal(got.error.code,-32601);assert.equal(s.tokens.length+s.calls.length,0);
});
for(const authorization of ['','Basic password','Bearer a b'])test('events require the original bearer: '+String(authorization?.split(' ')[0]),async()=>{
  const s=setup();const response=await s.handle(request(rpc('events/list'),authorization));assert.equal(response.status,401);assert.ok(response.headers.get('WWW-Authenticate')?.includes(metadata));assert.equal(s.calls.length,0);
});
test('denied admin and invalid identity expose no internal details',async()=>{
  for(const override of [{authenticateOriginalBearer:async()=>{throw new EventProtocolError('forbidden');}},{authenticateOriginalBearer:async()=>({...owner,user_id:'bad'})}]){
    const s=setup(override);const got=await result(await s.handle(request(rpc('events/list'))));assert.ok([-32003,-32000].includes(got.error.code));assert.equal(s.calls.length,0);
  }
});
test('event catalog is metadata-only with strict UUID filters',async()=>{
  const s=setup();const got=await result(await s.handle(request(rpc('events/list'))));assert.equal(got.result.events.length,2);assert.deepEqual(got.result.events.map((e:any)=>e.name),EVENT_NAMES);
  const serialized=JSON.stringify(got);for(const bad of ['email','screenshot_url','document_url','message_body'])assert.ok(!serialized.includes(bad));
  assert.deepEqual(s.tokens,['original-oauth-token']);assert.equal(s.calls.length,0);
});
test('list rejects unsupported cursors and filters without mutations',async()=>{
  for(const p of [{cursor:'history'},{unknown:true}]){const s=setup();assert.equal((await result(await s.handle(request(rpc('events/list',p))))).error.code,-32602);assert.equal(s.calls.length,0);}
});
test('verified subscription encrypts the secret and binds exactly to original identity',async()=>{
  const order:string[]=[];const crypto=await createSecretCrypto(master);
  const s=setup({verifyCallback:async()=>{order.push('verify');},serviceRpc:async(name,args)=>{order.push(name);s.calls.push({name,args});return name.endsWith('_identity')?sub:{id:sub,refreshBefore:'2026-11-04T00:00:00Z',cursor:null,truncated:false};}});
  const got=await result(await s.handle(request(rpc('events/subscribe',params()))));assert.equal(got.result.id,sub);assert.deepEqual(order,['sintagma_support_event_identity','verify','sintagma_support_event_subscribe_verified']);
  const args=s.calls[1].args;assert.equal(args.p_user_id,owner.user_id);assert.equal(args.p_client_id,owner.client_id);assert.equal(args.p_session_id,owner.session_id);assert.equal(args.p_ttl_seconds,86400);
  assert.ok(!JSON.stringify(args).includes(secret));assert.equal(await crypto.decryptSecret(args.p_secret_envelope as any,secretAad({owner_user_id:owner.user_id,oauth_client_id:owner.client_id,event_name:EVENT_NAMES[0],callback_url:url})),secret);
});
test('a failed challenge leaves no subscription, key encryption or mutation',async()=>{
  const s=setup({verifyCallback:async()=>{throw new CallbackEndpointError('challenge_failed');},secretCrypto:async()=>{throw Error('must not run');}});
  const got=await result(await s.handle(request(rpc('events/subscribe',params()))));assert.equal(got.error.code,-32015);assert.equal(got.error.data.reason,'challenge_failed');assert.deepEqual(s.calls.map(x=>x.name),['sintagma_support_event_identity']);assert.ok(!JSON.stringify(got).includes(secret));
});
for(const mutate of [(p:any)=>{p.delivery.secret='whsec_bad';},(p:any)=>{p.arguments.organization_id='bad';},(p:any)=>{p.arguments.extra='text';},(p:any)=>{p.cursor='replay';},(p:any)=>{p.name='unapproved';}])test('invalid subscription params never reach service or network',async()=>{
  const p=params();mutate(p);const s=setup();const got=await result(await s.handle(request(rpc('events/subscribe',p))));assert.equal(got.error.code,-32602);assert.equal(s.calls.length+s.verifications.length,0);
});
test('invalid callback URLs return categorized sanitized errors',async()=>{
  for(const value of ['http://receiver.openai.com','https://127.0.0.1/','https://name:password@receiver.openai.com/','https://receiver.openai.com/#secret']){
    const p=params();p.delivery.url=value;const s=setup();const got=await result(await s.handle(request(rpc('events/subscribe',p))));assert.equal(got.error.code,-32015);assert.equal(got.error.data.reason,'invalid_callback');assert.equal(s.calls.length,0);assert.ok(!JSON.stringify(got).includes(value));
  }
});
for(const [ttlMs,expected] of [[null,86400],[0,60],[60000,60],[999999999,86400]] as const)test('finite TTL policy '+ttlMs,async()=>{
  const s=setup();await s.handle(request(rpc('events/subscribe',{...params(),ttlMs})));assert.equal(s.calls[1].args.p_ttl_seconds,expected);
});
test('unsubscribe uses owner, canonical destination and filters without requiring a new secret',async()=>{
  const s=setup(),p=params();const {secret:unused,...delivery}=p.delivery;
  assert.deepEqual((await result(await s.handle(request(rpc('events/unsubscribe',{name:p.name,arguments:p.arguments,delivery}))))).result,{});
  assert.equal(s.calls[0].name,'sintagma_support_event_unsubscribe');assert.equal(s.calls[0].args.p_session_id,owner.session_id);assert.equal(s.verifications.length,0);
});
test('notifications or invalid JSON-RPC IDs cannot mutate subscriptions',async()=>{
  for(const id of [undefined,null,{},[]]){const s=setup();const got=await result(await s.handle(request({jsonrpc:'2.0',method:'events/subscribe',params:params(),id})));assert.equal(got.error.code,-32600);assert.equal(s.calls.length,0);}
});
test('wrong subscription receipts and thrown backend details are sanitized',async()=>{
  const s=setup({serviceRpc:async name=>{if(name.endsWith('_identity'))return sub;throw Error('SECRET '+secret+' '+master+' database details');}});
  const got=await result(await s.handle(request(rpc('events/subscribe',params()))));assert.deepEqual(got.error,{code:-32000,message:'Event operation unavailable'});
});
