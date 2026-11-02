/** Native Deno literal-IP TCP -> verified TLS -> bounded HTTP/1.1. No fetch. */
import {CallbackTransportError,NativeHttpsTransportError,canonicalizeCallback,isPublicAddress,sameAddress,PINNING_PROBE_URL,type NativeRuntimePhase,type PostInput,type PostResult,type PinnedHttpsTransport,type ResolvedAddress} from './callback-policy.ts';
import {readHttp1Response,serializeHttp1Request,writeAll,type NativeRead,type NativeWrite} from './native-http1.ts';

// Only a separately reviewed actual Edge pilot can change this marker.
export const DENO_NATIVE_HTTPS_PINNING_PROVEN=false;
export type NativeConn={readonly remoteAddr:unknown;read:NativeRead;write:NativeWrite;close():void};
export type NativeTlsConn=NativeConn&{handshake():Promise<{alpnProtocol:string|null}>};
export type NativeDenoRuntime={
  resolveDns(hostname:string,recordType:'A'|'AAAA',options?:{signal?:AbortSignal}):Promise<string[]>;
  connect(options:{hostname:string;port:443;transport:'tcp'}):Promise<NativeConn>;
  startTls(connection:NativeConn,options:{hostname:string;alpnProtocols:['http/1.1']}):Promise<NativeTlsConn>;
};
export type NativeDenoDependencies={runtime?:NativeDenoRuntime;timeoutMs?:number;signal?:AbortSignal};
function currentRuntime():NativeDenoRuntime|undefined{
  const value=(globalThis as {Deno?:Partial<NativeDenoRuntime>}).Deno;
  return value&&typeof value.resolveDns==='function'&&typeof value.connect==='function'&&typeof value.startTls==='function'?value as NativeDenoRuntime:undefined;
}
export function nativeDenoRuntimeAvailable():boolean{return currentRuntime()!==undefined;}
function closeSafely(conn:NativeConn|undefined){try{conn?.close();}catch{/* Consumed or already closed resource; never expose its raw error. */}}
function remoteIsPinned(raw:unknown,pinned:ResolvedAddress):boolean{
  if(!raw||typeof raw!=='object')return false;
  const remote=raw as {transport?:unknown;hostname?:unknown;port?:unknown};
  return remote.transport==='tcp'&&remote.port===443&&typeof remote.hostname==='string'&&isPublicAddress(remote.hostname)&&sameAddress(remote.hostname,pinned.address);
}
function emptyDnsAnswer(error:unknown):boolean{
  return error instanceof Error&&error.name==='NotFound';
}
export function createNativeDenoHttpsTransport(deps:NativeDenoDependencies={}):PinnedHttpsTransport{
  const runtime=deps.runtime??currentRuntime();
  if(deps.timeoutMs!==undefined&&!Number.isFinite(deps.timeoutMs))throw new CallbackTransportError('invalid_callback');
  const timeoutMs=Math.min(10000,Math.max(1,deps.timeoutMs??10000));
  function assertReady(){
    if(!runtime||!DENO_NATIVE_HTTPS_PINNING_PROVEN)throw new CallbackTransportError('runtime_not_proven');
  }
  async function send(input:PostInput,method:'HEAD'|'POST'):Promise<PostResult>{
    if(!runtime)throw new NativeHttpsTransportError('runtime_not_proven','connect');
    const u=new URL(canonicalizeCallback(input.url));
    const framed=serializeHttp1Request(u.href,input.headers,input.body,method);
    const requested=input.responseLimitBytes??4096;
    if(!Number.isFinite(requested))throw new CallbackTransportError('invalid_callback');
    const maxBodyBytes=method==='HEAD'?0:Math.min(262144,Math.max(0,Math.floor(requested)));
    return await new Promise<PostResult>((resolve,reject)=>{
      let done=false,conn:NativeConn|undefined,phase:NativeRuntimePhase='dns';
      const dnsAbort=new AbortController();
      const signals=[input.signal,deps.signal].filter((signal):signal is AbortSignal=>signal!==undefined);
      const clear=()=>{clearTimeout(timer);for(const signal of signals)signal.removeEventListener('abort',onAbort);dnsAbort.abort();};
      const fail=(error:unknown)=>{
        if(done)return;done=true;clear();closeSafely(conn);
        const reason=error instanceof CallbackTransportError?error.reason:phase==='dns'?'dns_failed':phase==='tls'||phase==='handshake'?'tls_failed':phase==='raw_pin'||phase==='tls_pin'?'pinning_failed':'network_error';
        reject(new NativeHttpsTransportError(reason,phase,error instanceof CallbackTransportError?error.httpStatus:undefined));
      };
      const onAbort=()=>fail(new CallbackTransportError('timeout'));
      const timer=setTimeout(onAbort,timeoutMs);
      for(const signal of signals)signal.addEventListener('abort',onAbort,{once:true});
      if(signals.some(signal=>signal.aborted)){onAbort();return;}
      void(async()=>{
        const answers=await Promise.allSettled((['A','AAAA'] as const).map(type=>Promise.resolve().then(()=>runtime.resolveDns(u.hostname,type,{signal:dnsAbort.signal}))));
        if(done)return;
        const addresses:ResolvedAddress[]=[];
        for(let i=0;i<answers.length;i++){
          const answer=answers[i];
          if(answer.status==='rejected'){if(emptyDnsAnswer(answer.reason))continue;throw new CallbackTransportError('dns_failed');}
          if(!Array.isArray(answer.value)||answer.value.length>64)throw new CallbackTransportError('dns_failed');
          for(const address of answer.value){
            const family=i===0?4:6;
            if(typeof address!=='string'||!isPublicAddress(address)||(address.includes(':')?6:4)!==family)throw new CallbackTransportError('destination_not_public');
            addresses.push({address,family});
          }
        }
        if(!addresses.length||addresses.length>64)throw new CallbackTransportError('dns_failed');
        // Validate every answer first. Prefer IPv4 without silently ignoring any
        // unsafe IPv6 record, and never pass a hostname to the TCP connector.
        const pinned=addresses.find(address=>address.family===4)??addresses[0];
        phase='connect';
        const raw=await runtime.connect({hostname:pinned.address,port:443,transport:'tcp'});
        if(done){closeSafely(raw);return;}conn=raw;
        phase='raw_pin';if(!remoteIsPinned(raw.remoteAddr,pinned))throw new CallbackTransportError('pinning_failed');
        phase='tls';
        // startTls consumes this exact TCP connection; hostname sets SNI and
        // default certificate identity verification, not a second DNS lookup.
        const tls=await runtime.startTls(raw,{hostname:u.hostname,alpnProtocols:['http/1.1']});
        if(done){closeSafely(tls);return;}conn=tls;
        phase='handshake';const handshake=await tls.handshake();
        if(done)return;
        if(!handshake||(handshake.alpnProtocol!==null&&handshake.alpnProtocol!=='http/1.1'))throw new CallbackTransportError('tls_failed');
        phase='tls_pin';if(!remoteIsPinned(tls.remoteAddr,pinned))throw new CallbackTransportError('pinning_failed');
        phase='write';
        const write:NativeWrite=async bytes=>{if(done)throw new CallbackTransportError('timeout');const n=await tls.write(bytes);if(done)throw new CallbackTransportError('timeout');return n;};
        await writeAll(write,framed.header);await writeAll(write,framed.body);
        if(done)return;
        const read:NativeRead=async bytes=>{if(done)throw new CallbackTransportError('timeout');const n=await tls.read(bytes);if(done)throw new CallbackTransportError('timeout');return n;};
        const result=await readHttp1Response(read,{method,maxBodyBytes,onPhase:value=>{phase=value;}});
        if(done)return;done=true;clear();closeSafely(conn);resolve(result);
      })().catch(fail);
    });
  }
  return{implementation:'deno-native-http1',assertReady,
    async post(input){assertReady();return send(input,'POST');},
    async probeRuntime(){
      const result=await send({url:PINNING_PROBE_URL,body:new Uint8Array(),headers:{},responseLimitBytes:0},'HEAD');
      return{status:result.status,implementation:'deno-native-http1'};
    },
  };
}
