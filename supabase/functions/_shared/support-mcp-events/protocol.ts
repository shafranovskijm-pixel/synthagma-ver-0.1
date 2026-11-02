import { z } from 'zod';
import type { SecretCrypto } from './crypto.ts';
import { secretAad, validateWebhookSecret } from './crypto.ts';
import { canonicalizeCallback, CallbackTransportError } from './pinned-https.ts';
import { CallbackEndpointError, type VerifyCallbackInput } from './webhooks.ts';

export const EVENT_NAMES = ['support.platform_chat.message.created', 'support.problem_report.created'] as const;
export type EventName = typeof EVENT_NAMES[number];
export type Identity = { user_id: string; client_id: string; session_id: string };
export const identitySchema = z.object({ user_id:z.string().uuid(), client_id:z.string().uuid(), session_id:z.string().uuid() }).strict();
const filters = z.object({ organization_id:z.string().uuid().optional(), user_id:z.string().uuid().optional() }).strict();
const target = z.object({ mode:z.literal('webhook'), url:z.string().min(1).max(2048) }).strict();
const subscribe = z.object({ name:z.enum(EVENT_NAMES), arguments:filters,
  delivery:target.extend({ secret:z.string().min(1).max(100) }).strict(),
  cursor:z.null().optional(), ttlMs:z.number().int().nonnegative().nullable().optional(),
}).strict();
const unsubscribe = z.object({ name:z.enum(EVENT_NAMES), arguments:filters, delivery:target }).strict();
const receipt = z.object({ id:z.string().regex(/^sub_[a-f0-9]{64}$/), refreshBefore:z.string().datetime({offset:true}), cursor:z.null(), truncated:z.literal(false) }).strict();

export interface ProtocolBackend {
  isReady():Promise<boolean>;
  authenticateOriginalBearer(token:string):Promise<Identity>;
  // Every service mutation is bound to this freshly verified original identity.
  serviceRpc(name:string,args:Record<string,unknown>):Promise<unknown>;
  secretCrypto():Promise<SecretCrypto>;
  verifyCallback(input:VerifyCallbackInput):Promise<void>;
}
export class EventProtocolError extends Error {
  readonly code:'unauthorized'|'forbidden'|'configuration_unavailable'|'operation_failed';
  constructor(code:EventProtocolError['code']) { super(code); this.code=code; }
}
function ownerArgs(owner:Identity,name:EventName,args:unknown,url:string) {
  return { p_user_id:owner.user_id,p_client_id:owner.client_id,p_session_id:owner.session_id,p_name:name,p_arguments:args,p_callback_url:url };
}
function json(body:unknown,status=200,extra:Record<string,string>={}) {
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'WWW-Authenticate',...extra}});
}
function rpcError(id:unknown,code:number,message:string,status=200,data?:Record<string,unknown>,headers?:Record<string,string>) {
  return json({jsonrpc:'2.0',id:id??null,error:{code,message,...(data?{data}:{})}},status,headers);
}
function eventCatalog() {
  const inputSchema={type:'object',properties:{organization_id:{type:'string',format:'uuid'},user_id:{type:'string',format:'uuid'}},additionalProperties:false};
  const dataProperties={source_kind:{type:'string'},source_id:{type:'string',format:'uuid'},message_id:{anyOf:[{type:'string',format:'uuid'},{type:'null'}]},organization_id:{anyOf:[{type:'string',format:'uuid'},{type:'null'}]}};
  return EVENT_NAMES.map(name=>({name,delivery:['webhook'],inputSchema,
    description:name===EVENT_NAMES[0]
      ? 'New user message in SINTAGMA platform support. Data contains IDs only. Read the authorized request with get_sintagma_support_request using source_kind=platform_chat and source_id.'
      : 'New SINTAGMA problem report. Data contains IDs only. Read the authorized report with get_sintagma_support_request using source_kind=problem_report and source_id.',
    payloadSchema:{type:'object',properties:{...dataProperties,source_kind:{const:name===EVENT_NAMES[0]?'platform_chat':'problem_report'}},
      required:['source_kind','source_id','message_id','organization_id'],additionalProperties:false},
  }));
}
async function boundedText(body:ReadableStream<Uint8Array>|null,max:number,timeout=3000,stopAt?:(text:string)=>boolean):Promise<string> {
  if(!body)return '';
  const reader=body.getReader();let bytes=0;let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const work=(async()=>{const decoder=new TextDecoder('utf-8',{fatal:true});let text='';while(true){const next=await reader.read();if(next.done)return text+decoder.decode();bytes+=next.value.byteLength;if(bytes>max)throw new Error('budget');text+=decoder.decode(next.value,{stream:true});if(stopAt?.(text))return text;}})();
    return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeout);})]);
  } finally {if(timer)clearTimeout(timer);reader.cancel().catch(()=>{});}
}
function initObject(value:unknown,id:unknown):Record<string,unknown>|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const rpc=value as Record<string,unknown>;
  if(rpc.jsonrpc!=='2.0'||rpc.id!==id||!rpc.result||typeof rpc.result!=='object'||Array.isArray(rpc.result)||rpc.error)return null;
  const result=rpc.result as Record<string,unknown>;
  if(!result.capabilities||typeof result.capabilities!=='object'||Array.isArray(result.capabilities))return null;
  return {...rpc,result:{...result,capabilities:{...result.capabilities as Record<string,unknown>,events:{}}}};
}
async function advertise(response:Response,id:unknown):Promise<Response> {
  if(!response.ok)return response;
  const kind=response.headers.get('content-type')??'';
  if(!/application\/json|text\/event-stream/.test(kind))return response;
  try {
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.set('Cache-Control','no-store');
    if(kind.includes('text/event-stream')&&response.body){
      // Transform complete SSE frames without closing the original live stream or
      // discarding later notifications. Unrecognized frames remain unchanged.
      const decoder=new TextDecoder(),encoder=new TextEncoder();let pending='',done=false;
      const transform=new TransformStream<Uint8Array,Uint8Array>({
        transform(chunk,controller){
          if(done){const tail=decoder.decode(chunk,{stream:true});if(tail)controller.enqueue(encoder.encode(tail));return;}
          pending+=decoder.decode(chunk,{stream:true});
          let match:RegExpExecArray|null;
          while((match=/\r?\n\r?\n/.exec(pending))){
            const frame=pending.slice(0,match.index),delimiter=match[0];pending=pending.slice(match.index+delimiter.length);
            const lines=frame.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
            let replacement:string|null=null;
            try{const value=initObject(JSON.parse(data),id);if(value)replacement=[...lines.filter(l=>!l.startsWith('data:')),'data: '+JSON.stringify(value)].join('\n');}catch{/* preserve frame */}
            controller.enqueue(encoder.encode((replacement??frame)+delimiter));
            if(replacement!==null){done=true;if(pending)controller.enqueue(encoder.encode(pending));pending='';return;}
          }
          if(encoder.encode(pending).byteLength>65536){controller.enqueue(encoder.encode(pending));pending='';done=true;}
        },
        flush(controller){pending+=decoder.decode();if(pending)controller.enqueue(encoder.encode(pending));},
      });
      return new Response(response.body.pipeThrough(transform),{status:response.status,statusText:response.statusText,headers});
    }
    const text=await boundedText(response.clone().body,65536),data=initObject(JSON.parse(text),id);
    return data?new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers}):response;
  }catch{return response;}
}
/** Adds event methods while preserving the original OAuth tools/metadata handler. */
export function withSupportEventsProtocol(fallback:(request:Request)=>Promise<Response>,backend:ProtocolBackend,metadataUrl:string) {
  return async function handle(request:Request):Promise<Response> {
    if(request.method!=='POST'||new URL(request.url).pathname.includes('/.mcp/'))return fallback(request);
    let raw:string;let call:Record<string,unknown>;
    try {
      raw=await boundedText(request.clone().body,32768);
      const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return fallback(request);
      call=value;
    }catch{return fallback(request);}
    if(call.method==='initialize'){
      const original=await fallback(request);
      try {return original.ok&&await backend.isReady()?await advertise(original,call.id):original;}catch{return original;}
    }
    if(!['events/list','events/subscribe','events/unsubscribe'].includes(String(call.method)))return fallback(request);
    if(call.jsonrpc!=='2.0'||!(typeof call.id==='string'||typeof call.id==='number'&&Number.isFinite(call.id)))return rpcError(call.id,-32600,'Invalid Request',400);
    const id=call.id;
    try {
      if(!await backend.isReady())return rpcError(id,-32601,'Method not found');
      const authorization=request.headers.get('authorization')??'';
      const token=/^Bearer ([^\s]{1,16384})$/i.exec(authorization)?.[1];
      if(!token)throw new EventProtocolError('unauthorized');
      const owner=identitySchema.parse(await backend.authenticateOriginalBearer(token));
      if(call.method==='events/list'){
        if(!z.object({cursor:z.null().optional()}).strict().safeParse(call.params??{}).success)return rpcError(id,-32602,'Invalid params');
        return json({jsonrpc:'2.0',id,result:{events:eventCatalog(),nextCursor:null}});
      }
      if(call.method==='events/unsubscribe'){
        const input=unsubscribe.safeParse(call.params);if(!input.success)return rpcError(id,-32602,'Invalid params');
        const p=input.data,url=canonicalizeCallback(p.delivery.url);
        await backend.serviceRpc('sintagma_support_event_unsubscribe',ownerArgs(owner,p.name,p.arguments,url));
        return json({jsonrpc:'2.0',id,result:{}});
      }
      const input=subscribe.safeParse(call.params);if(!input.success)return rpcError(id,-32602,'Invalid params');
      const p=input.data,url=canonicalizeCallback(p.delivery.url);
      try{validateWebhookSecret(p.delivery.secret);}catch{return rpcError(id,-32602,'Invalid params');}
      const scope=ownerArgs(owner,p.name,p.arguments,url);
      const subscriptionId=await backend.serviceRpc('sintagma_support_event_identity',scope);
      if(typeof subscriptionId!=='string'||!/^sub_[a-f0-9]{64}$/.test(subscriptionId))throw new EventProtocolError('operation_failed');
      // No subscription mutation or application delivery precedes verification.
      await backend.verifyCallback({url,secret:p.delivery.secret,subscriptionId,principalKey:JSON.stringify([owner.user_id,owner.client_id])});
      const crypto=await backend.secretCrypto();
      const binding={owner_user_id:owner.user_id,oauth_client_id:owner.client_id,event_name:p.name,callback_url:url};
      const encrypted=await crypto.encryptSecret(p.delivery.secret,secretAad(binding));
      const keyHash=await crypto.hashSecret(p.delivery.secret);
      const ttlSeconds=Math.max(60,Math.min(86400,Math.floor((p.ttlMs??86400000)/1000)));
      const saved=receipt.parse(await backend.serviceRpc('sintagma_support_event_subscribe_verified',{
        ...scope,p_secret_envelope:encrypted,p_secret_sha256:keyHash,p_ttl_seconds:ttlSeconds,
      }));
      if(saved.id!==subscriptionId)throw new EventProtocolError('operation_failed');
      return json({jsonrpc:'2.0',id,result:saved});
    }catch(error){
      if(error instanceof CallbackEndpointError)return rpcError(id,-32015,'Callback endpoint verification failed',200,{reason:error.reason});
      if(error instanceof CallbackTransportError)return rpcError(id,-32015,'Callback endpoint verification failed',200,{reason:error.reason});
      if(error instanceof EventProtocolError&&error.code==='unauthorized')return rpcError(id,-32001,'Authentication required',401,undefined,{'WWW-Authenticate':`Bearer resource_metadata="${metadataUrl}"`});
      if(error instanceof EventProtocolError&&error.code==='forbidden')return rpcError(id,-32003,'Support administrator access required',403);
      if(error instanceof z.ZodError)return rpcError(id,-32000,'Event operation unavailable');
      return rpcError(id,-32000,'Event operation unavailable');
    }
  };
}
