/** Internal, bounded HTTP/1.1 codec. No network connection or readiness bypass. */
import {CallbackTransportError,canonicalizeCallback,type PostResult} from './callback-policy.ts';

export type NativeRead=(buffer:Uint8Array)=>Promise<number|null>;
export type NativeWrite=(buffer:Uint8Array)=>Promise<number>;
export type HttpMethod='HEAD'|'POST';
const HEADER_LIMIT=16384,HEADER_COUNT_LIMIT=128,CHUNK_LINE_LIMIT=1024,CHUNK_COUNT_LIMIT=4096;
const encoder=new TextEncoder();
const token=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function serializeHttp1Request(url:string,headers:Record<string,string>,payload:Uint8Array,method:HttpMethod):{header:Uint8Array;body:Uint8Array}{
  const u=new URL(canonicalizeCallback(url));
  if(!(payload instanceof Uint8Array)||payload.byteLength>262144)throw new CallbackTransportError('payload_too_large');
  if(method!=='HEAD'&&method!=='POST')throw new CallbackTransportError('invalid_callback');
  if(method==='HEAD'&&(payload.byteLength!==0||Object.keys(headers).length!==0))throw new CallbackTransportError('invalid_callback');
  const allowed=new Set(['content-type','webhook-id','webhook-timestamp','webhook-signature','x-mcp-subscription-id']);
  const seen=new Set<string>(),lines=[`${method} ${u.pathname+u.search} HTTP/1.1`,`Host: ${u.hostname}`,'Connection: close',`Content-Length: ${payload.byteLength}`,'Accept-Encoding: identity'];
  if(Object.keys(headers).length>allowed.size)throw new CallbackTransportError('invalid_callback');
  for(const [name,value]of Object.entries(headers)){
    const lower=name.toLowerCase();
    if(!token.test(name)||!allowed.has(lower)||seen.has(lower)||typeof value!=='string'||value.length>4096||/[^\x20-\x7e]/.test(value))throw new CallbackTransportError('invalid_callback');
    seen.add(lower);lines.push(`${lower}: ${value}`);
  }
  const header=encoder.encode(lines.join('\r\n')+'\r\n\r\n');
  if(header.byteLength>HEADER_LIMIT)throw new CallbackTransportError('invalid_callback');
  return{header,body:Uint8Array.from(payload)};
}
export async function writeAll(write:NativeWrite,bytes:Uint8Array):Promise<void>{
  let offset=0;
  while(offset<bytes.byteLength){
    let n:number;try{n=await write(bytes.subarray(offset));}catch{throw new CallbackTransportError('network_error');}
    if(!Number.isSafeInteger(n)||n<=0||n>bytes.byteLength-offset)throw new CallbackTransportError('network_error');
    offset+=n;
  }
}

export async function readHttp1Response(read:NativeRead,options:{method:HttpMethod;maxBodyBytes:number;onPhase?:(phase:'headers'|'body')=>void}):Promise<PostResult>{
  if((options.method!=='HEAD'&&options.method!=='POST')||!Number.isSafeInteger(options.maxBodyBytes)||options.maxBodyBytes<0||options.maxBodyBytes>262144)throw new CallbackTransportError('invalid_callback');
  const limit=options.method==='HEAD'?0:options.maxBodyBytes,wireLimit=HEADER_LIMIT+limit+65536;
  let pending=new Uint8Array(),wire=0,reads=0,eof=false,status:number|undefined;
  const fail=(reason:'network_error'|'response_too_large'|'redirect_blocked'):never=>{throw new CallbackTransportError(reason,status);};
  async function pull():Promise<boolean>{
    if(eof)return false;
    if(++reads>65536)fail('response_too_large');
    const buffer=new Uint8Array(8192);let n:number|null=null;
    try{n=await read(buffer);}catch{return fail('network_error');}
    if(n===null){eof=true;return false;}
    if(!Number.isSafeInteger(n)||n<0||n>buffer.length)fail('network_error');
    // Deno permits zero-byte reads; this narrowly scoped HTTP client refuses a
    // stalled read rather than spinning microtasks or mistaking it for EOF.
    if(n===0)fail('network_error');
    wire+=n;if(wire>wireLimit)fail('response_too_large');
    const next=new Uint8Array(pending.length+n);next.set(pending);next.set(buffer.subarray(0,n),pending.length);pending=next;return true;
  }
  async function line(max:number):Promise<string>{
    let scan=0;
    while(true){
      for(let i=scan;i<pending.length;i++){
        const b=pending[i];
        if(b===10&&(i===0||pending[i-1]!==13))fail('network_error');
        if(b===13&&i+1<pending.length){
          if(pending[i+1]!==10)fail('network_error');
          if(i>max)fail('response_too_large');
          const value=String.fromCharCode(...pending.subarray(0,i));pending=pending.slice(i+2);return value;
        }
      }
      if(pending.length>max+1)fail('response_too_large');
      scan=Math.max(0,pending.length-1);
      if(!(await pull()))fail('network_error');
    }
  }
  async function exact(n:number):Promise<Uint8Array>{
    while(pending.length<n)if(!(await pull()))fail('network_error');
    const bytes=pending.slice(0,n);pending=pending.slice(n);return bytes;
  }
  options.onPhase?.('headers');
  const first=await line(HEADER_LIMIT-2);
  const statusMatch=/^HTTP\/1\.1 ([2-5][0-9]{2}) [\x20-\x7e]*$/.exec(first);
  if(!statusMatch)return fail('network_error');status=Number(statusMatch[1]);
  let headerBytes=first.length+2,headerCount=0;
  const fields=new Map<string,string[]>();
  while(true){
    const item=await line(HEADER_LIMIT-2);headerBytes+=item.length+2;
    if(headerBytes>HEADER_LIMIT)fail('response_too_large');
    if(item==='')break;
    if(++headerCount>HEADER_COUNT_LIMIT)fail('response_too_large');
    const colon=item.indexOf(':');
    if(colon<=0||!token.test(item.slice(0,colon))||/[^\x09\x20-\x7e]/.test(item.slice(colon+1)))fail('network_error');
    const name=item.slice(0,colon).toLowerCase(),value=item.slice(colon+1).replace(/^[ \t]+|[ \t]+$/g,'');
    fields.set(name,[...(fields.get(name)??[]),value]);
  }
  const cl=fields.get('content-length'),te=fields.get('transfer-encoding'),ce=fields.get('content-encoding');
  if((cl&&te)||(cl&&cl.length!==1)||(te&&(te.length!==1||te[0].toLowerCase()!=='chunked'))||(options.method==='POST'&&ce&&(ce.length!==1||ce[0].toLowerCase()!=='identity')))fail('network_error');
  let length:number|undefined;
  if(cl){if(!/^[0-9]+$/.test(cl[0]))fail('network_error');length=Number(cl[0]);if(!Number.isSafeInteger(length))fail('network_error');}
  if(status>=300&&status<400)fail('redirect_blocked');
  if(options.method==='HEAD'||status===204){
    if(pending.length)fail('network_error');
    // HEAD Content-Length/Encoding are GET representation metadata; no decoding.
    // The transport closes immediately; waiting for EOF could stall a valid HEAD.
    return{status,body:new Uint8Array()};
  }
  options.onPhase?.('body');
  const chunks:Uint8Array[]=[];let decoded=0;
  function add(bytes:Uint8Array){if(decoded+bytes.length>limit)fail('response_too_large');decoded+=bytes.length;if(bytes.length)chunks.push(bytes);}
  if(te){
    let count=0;
    while(true){
      if(++count>CHUNK_COUNT_LIMIT)fail('response_too_large');
      const sizeLine=await line(CHUNK_LINE_LIMIT),parts=sizeLine.split(';');
      if(!/^[0-9A-Fa-f]{1,16}$/.test(parts[0]))fail('network_error');
      // A deliberately narrow, bounded extension grammar; quoted extensions and
      // nonempty trailers are refused rather than normalized ambiguously.
      if(parts.slice(1).some(part=>{const pair=part.split('=');return pair.length>2||!token.test(pair[0])||(pair.length===2&&!token.test(pair[1]));}))fail('network_error');
      const size=Number.parseInt(parts[0],16);if(!Number.isSafeInteger(size))fail('network_error');
      if(size===0){if((await line(CHUNK_LINE_LIMIT))!==''||pending.length)fail('network_error');break;}
      if(decoded+size>limit)fail('response_too_large');add(await exact(size));
      const ending=await exact(2);if(ending[0]!==13||ending[1]!==10)fail('network_error');
    }
  }else if(length!==undefined){
    if(length>limit)fail('response_too_large');add(await exact(length));if(pending.length)fail('network_error');
  }else{
    while(true){if(pending.length){add(pending);pending=new Uint8Array();}if(!(await pull()))break;}
  }
  const body=new Uint8Array(decoded);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}
  return{status,body};
}
