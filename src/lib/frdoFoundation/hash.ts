export const BOUNDS={inputBytes:8_000_000,xmlBytes:12_000_000,zipBytes:20_971_520,inflatedBytes:20_000_000,zipEntries:64,rows:1000,cellBytes:32000} as const;
export type FoundationErrorCode='INVALID_REQUEST'|'ACCESS_DENIED'|'READINESS_BLOCKED'|'SOURCE_CHANGED'|'SOURCE_UNAVAILABLE'|'TEMPLATE_CHANGED'|'LIMIT_EXCEEDED'|'INVALID_WORKBOOK'|'DEPENDENCY_UNAVAILABLE';
export class FrdoFoundationError extends Error{constructor(readonly code:FoundationErrorCode){super(code);this.name='FrdoFoundationError';}}
export function refuse(code:FoundationErrorCode='INVALID_WORKBOOK'):never{throw new FrdoFoundationError(code);}
export function ensureCurrent(guard:{assertCurrent:()=>void}):void{try{guard.assertCurrent();}catch{return refuse('ACCESS_DENIED');}}
export function utf8(value:string,maxBytes:number):Uint8Array{
 if(value.length>maxBytes)return refuse('LIMIT_EXCEEDED');const bytes=new TextEncoder().encode(value);if(bytes.length>maxBytes)return refuse('LIMIT_EXCEEDED');
 if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==value)return refuse('INVALID_REQUEST');return bytes;
}
export function decodeUtf8(bytes:Uint8Array,maxBytes:number):string{
 if(bytes.length>maxBytes)return refuse('LIMIT_EXCEEDED');let value:string;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return refuse('INVALID_WORKBOOK');}
 const encoded=utf8(value,maxBytes);if(encoded.length!==bytes.length||encoded.some((v,i)=>v!==bytes[i]))return refuse('INVALID_WORKBOOK');return value;
}
/** Canonical JSON rejects unsupported values and enforces the byte bound while writing,
 * before allocating a complete large string. It is a deterministic local hash domain,
 * never the UC018 metadata content_hash or proof of database/file authority. */
export function canonicalJson(value:unknown,maxBytes:number=BOUNDS.inputBytes):string{
 const chunks:string[]=[];let bytes=0;const active=new Set<object>();
 const append=(s:string)=>{bytes+=utf8(s,maxBytes).length;if(bytes>maxBytes)refuse('LIMIT_EXCEEDED');chunks.push(s);};
 const visit=(v:unknown,depth:number):void=>{if(depth>64)return refuse('LIMIT_EXCEEDED');
  if(v===null){append('null');return;}if(typeof v==='string'){utf8(v,maxBytes);append(JSON.stringify(v));return;}
  if(typeof v==='number'){if(!Number.isFinite(v)||!Number.isSafeInteger(v))return refuse('INVALID_REQUEST');append(JSON.stringify(v));return;}
  if(typeof v==='boolean'){append(v?'true':'false');return;}
  if(typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype&&!Array.isArray(v))return refuse('INVALID_REQUEST');
  if(active.has(v))return refuse('INVALID_REQUEST');active.add(v);
  if(Array.isArray(v)){append('[');for(let i=0;i<v.length;i++){if(!Object.prototype.hasOwnProperty.call(v,i))return refuse('INVALID_REQUEST');if(i)append(',');visit(v[i],depth+1);}append(']');}
  else{append('{');Object.keys(v).sort().forEach((key,i)=>{if(i)append(',');utf8(key,maxBytes);append(JSON.stringify(key));append(':');visit((v as Record<string,unknown>)[key],depth+1);});append('}');}active.delete(v);
 };visit(value,0);return chunks.join('');
}
export async function sha256(value:string|Uint8Array):Promise<string>{const bytes=typeof value==='string'?utf8(value,BOUNDS.inflatedBytes):new Uint8Array(value);const buffer=new ArrayBuffer(bytes.byteLength);new Uint8Array(buffer).set(bytes);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');}
export function deepFreeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}
