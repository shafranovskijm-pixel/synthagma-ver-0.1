import JSZip from 'jszip';
import {BOUNDS,decodeUtf8,ensureCurrent,refuse,FrdoFoundationError} from './hash.ts';
import type {CurrentGuard} from './types.ts';
export interface ZipEntry{path:string;compressed:number;bytes:number;crc:number;offset:number;method:number;flags:number;}
export interface Budget{guard:CurrentGuard;expires:number;}
export const newBudget=(guard:CurrentGuard):Budget=>({guard,expires:performance.now()+45000});
export function remaining(budget:Budget):number{ensureCurrent(budget.guard);const time=budget.expires-performance.now();if(time<=0)return refuse('DEPENDENCY_UNAVAILABLE');return time;}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes:Uint8Array):number{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
/** ZIP32 central/local layout is checked before any decompression; no encryption,
 * path aliases, duplicates, Zip64, multi-disk or unbounded declared content. Actual
 * decompressed chunks are independently capped, so a lying size header is not trusted. */
export function zipDirectory(bytes:Uint8Array):ZipEntry[]{
 if(bytes.length<22||bytes.length>BOUNDS.zipBytes)return refuse('LIMIT_EXCEEDED');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)return refuse();
 const n=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
 if(n!==view.getUint16(end+8,true)||n<1||n>BOUNDS.zipEntries||start+size!==end)return refuse();
 const entries:ZipEntry[]=[],paths=new Set<string>(),ranges:{start:number;end:number}[]=[];let at=start,total=0;
 for(let i=0;i<n;i++){
  if(at+46>end||view.getUint32(at,true)!==0x02014b50)return refuse();
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),compressed=view.getUint32(at+20,true),length=view.getUint32(at+24,true),nl=view.getUint16(at+28,true),el=view.getUint16(at+30,true),cl=view.getUint16(at+32,true),offset=view.getUint32(at+42,true);
  // PKWARE APPNOTE6.3.10 section4.4.4: bits1/2 are DEFLATE options, not STORE options.
  const allowedFlags=0x0808|(method===8?0x0006:0);
  if(flags&~allowedFlags||![0,8].includes(method)||view.getUint16(at+34,true)!==0||at+46+nl+el+cl>end||offset+30>start)return refuse();
  const path=decodeUtf8(bytes.subarray(at+46,at+46+nl),2000);
  if(!path||path.startsWith('/')||/[\\\x00-\x20?#]/.test(path)||path.includes('://')||path.split('/').some(p=>!p||p==='.'||p==='..')||paths.has(path))return refuse();paths.add(path);
  if(view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+6,true)!==flags||view.getUint16(offset+8,true)!==method)return refuse();
  const localName=view.getUint16(offset+26,true),localExtra=view.getUint16(offset+28,true),data=offset+30+localName+localExtra;
  if(data+compressed>start||decodeUtf8(bytes.subarray(offset+30,offset+30+localName),2000)!==path)return refuse();
  total+=length;if(total>BOUNDS.inflatedBytes||length>BOUNDS.xmlBytes)return refuse('LIMIT_EXCEEDED');
  ranges.push({start:offset,end:data+compressed});entries.push({path,compressed,bytes:length,crc:view.getUint32(at+16,true),offset,method,flags});at+=46+nl+el+cl;
 }
 if(at!==end)return refuse();ranges.sort((a,b)=>a.start-b.start);if(ranges.some((r,i)=>i>0&&r.start<ranges[i-1].end))return refuse();return entries;
}
export function boundedStream(stream:JSZip.JSZipStreamHelper<Uint8Array>,max:number,budget:Budget):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{const chunks:Uint8Array[]=[];let size=0,closed=false;
  const stop=(error:unknown)=>{if(closed)return;closed=true;clearTimeout(timer);stream.pause();chunks.length=0;reject(error);};
  const timer=setTimeout(()=>stop(new FrdoFoundationError('DEPENDENCY_UNAVAILABLE')),remaining(budget));
  stream.on('data',chunk=>{if(closed)return;try{remaining(budget);size+=chunk.length;if(size>max)return refuse('LIMIT_EXCEEDED');chunks.push(new Uint8Array(chunk));}catch(error){stop(error);}})
  .on('error',()=>stop(new FrdoFoundationError('INVALID_WORKBOOK'))).on('end',()=>{if(closed)return;try{remaining(budget);const value=new Uint8Array(size);let offset=0;for(const chunk of chunks){value.set(chunk,offset);offset+=chunk.length;}closed=true;clearTimeout(timer);chunks.length=0;resolve(value);}catch(error){stop(error);}}).resume();
 });
}
interface StreamableFile extends JSZip.JSZipObject{internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>;}
export async function readZipParts(bytes:Uint8Array,budget:Budget):Promise<{zip:JSZip;parts:Map<string,Uint8Array>}>{
 remaining(budget);const directory=zipDirectory(bytes);let zip:JSZip;try{zip=await JSZip.loadAsync(bytes,{createFolders:false,checkCRC32:false});}catch{return refuse();}remaining(budget);
 if(Object.keys(zip.files).length!==directory.length)return refuse();const parts=new Map<string,Uint8Array>();let total=0;
 for(const entry of directory){const file=zip.file(entry.path)as StreamableFile|null;if(!file||file.dir||file.unsafeOriginalName!==undefined&&file.unsafeOriginalName!==entry.path||typeof file.internalStream!=='function')return refuse();
  let stream:JSZip.JSZipStreamHelper<Uint8Array>;try{stream=file.internalStream('uint8array');}catch{return refuse();}
  const raw=await boundedStream(stream,Math.min(entry.bytes,BOUNDS.inflatedBytes-total),budget);remaining(budget);
  if(raw.length!==entry.bytes||crc32(raw)!==entry.crc)return refuse();total+=raw.length;if(total>BOUNDS.inflatedBytes)return refuse('LIMIT_EXCEEDED');parts.set(entry.path,raw);
 }return {zip,parts};
}
