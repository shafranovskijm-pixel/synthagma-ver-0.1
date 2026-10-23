import {AssuranceError,runInvitation,type InvitationDependencies} from './worker.ts';
const MAX_REQUEST_BYTES=196608;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
async function readJson(request: Request, signal: AbortSignal): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d{1,12}$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new AssuranceError('INVALID_INPUT');
  }
  if (!request.body) throw new AssuranceError('INVALID_INPUT');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0, completed = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new AssuranceError('DEPENDENCY_UNAVAILABLE');
      const next = await reader.read();
      if (signal.aborted) throw new AssuranceError('DEPENDENCY_UNAVAILABLE');
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new AssuranceError('INVALID_INPUT');
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    completed = true;
    return value;
  } catch (error) {
    if (error instanceof AssuranceError) throw error;
    throw new AssuranceError('INVALID_INPUT');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!completed) cancel();
    try { reader.releaseLock(); } catch { /* An aborted stream is being cancelled. */ }
  }
}


/** originalJwt null is an anonymous bearer invitation, never a decoded user claim. */
export function createInvitationHttpHandler(makeDependencies:(originalJwt:string|null)=>InvitationDependencies,ownPublicKey?:string){return async(request:Request)=>{
 const reply=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return reply({version:1,ok:false,code:'INVALID_INPUT'},405);
 const authorization=request.headers.get('authorization');let originalJwt:string|null=null;if(authorization!==null){const match=/^Bearer ([^\s]+)$/.exec(authorization);if(!match||match[1].length>32768)return reply({version:1,ok:false,code:'ACCESS_DENIED'},401);if(match[1]!==ownPublicKey)originalJwt=match[1];}
 const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();const timer=setTimeout(abort,55000);let bodyTimer:ReturnType<typeof setTimeout>|undefined=setTimeout(abort,10000);try{const body=await readJson(request,controller.signal);clearTimeout(bodyTimer);bodyTimer=undefined;return reply(await runInvitation(body,makeDependencies(originalJwt),controller.signal),200);}catch(error){const code=error instanceof AssuranceError?error.code:'DEPENDENCY_UNAVAILABLE';return reply({version:1,ok:false,code},code==='ACCESS_DENIED'?401:code==='INVALID_INPUT'?400:code==='NOT_FOUND'?404:code==='DEPENDENCY_UNAVAILABLE'?503:409);}finally{if(bodyTimer!==undefined)clearTimeout(bodyTimer);clearTimeout(timer);request.signal.removeEventListener('abort',abort);controller.abort();}
};}
