import { checkPublication, parsePublicationCheckInput, PublicationWorkerError, type PublicationCheckDependencies } from "./worker.ts";
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
async function readBody(request:Request,signal:AbortSignal):Promise<unknown>{
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??""))throw new PublicationWorkerError("INVALID_INPUT");
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>8192))throw new PublicationWorkerError("INVALID_INPUT");
 const reader=request.body?.getReader();if(!reader)throw new PublicationWorkerError("INVALID_INPUT");const chunks:Uint8Array[]=[];let bytes=0;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",cancel,{once:true});
 try{for(;;){if(signal.aborted)throw new PublicationWorkerError("UNAVAILABLE");const next=await reader.read();if(signal.aborted)throw new PublicationWorkerError("UNAVAILABLE");if(next.done)break;bytes+=next.value.length;if(bytes>8192){cancel();throw new PublicationWorkerError("INVALID_INPUT");}chunks.push(next.value);}const raw=new Uint8Array(bytes);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));}
 catch(error){if(error instanceof PublicationWorkerError)throw error;throw new PublicationWorkerError("INVALID_INPUT");}finally{signal.removeEventListener("abort",cancel);try{reader.releaseLock();}catch{}}
}
export function createPublicationCheckHandler(factory:(originalJwt:string)=>PublicationCheckDependencies){
 return async(request:Request):Promise<Response>=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return new Response(JSON.stringify({error:"INVALID_INPUT"}),{status:405,headers});
  const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get("authorization")??"");
  if(!match||match[1].length>16000)return new Response(JSON.stringify({error:"ACCESS_DENIED"}),{status:401,headers});
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const expiry=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new PublicationWorkerError("UNAVAILABLE"));},30000);});
   const execute=async()=>{const input=parsePublicationCheckInput(await readBody(request,controller.signal));return checkPublication(input,factory(match[1]),controller.signal);};
   const result=await Promise.race([execute(),expiry]);return new Response(JSON.stringify(result),{status:200,headers});
  }catch(error){const code=error instanceof PublicationWorkerError?error.code:"UNAVAILABLE";return new Response(JSON.stringify({error:code}),{status:code==="ACCESS_DENIED"?403:code==="INVALID_INPUT"?400:code==="REVISION_CONFLICT"||code==="SOURCE_CHANGED"?409:503,headers});}
  finally{if(timer)clearTimeout(timer);controller.abort();}
 };
}
