import {OFFICIAL_TEMPLATES} from './officialMetadata.ts';
import {BOUNDS,decodeUtf8,ensureCurrent,refuse,sha256,utf8} from './hash.ts';
import {mapFrozenProjections} from './mapper.ts';
import {fillTargetRows,parseXml,verifyNativeStructure,verifyWrittenCells,type VerifiedPublicDonorStructure} from './ooxml.ts';
import {boundedStream,newBudget,readZipParts,remaining,type Budget} from './zip.ts';
import {browserXmlRuntime,type XmlRuntime} from './xmlRuntime.ts';
import {verifySealedMappedBatch} from './sealedBatch.ts';
import type {CurrentGuard,MappedBatch,PartProof,Stream,WorkbookOutput} from './types.ts';
export interface WorkbookRuntimeOptions{xml?:XmlRuntime;}
async function partProofs(parts:ReadonlyMap<string,Uint8Array>,budget:Budget):Promise<PartProof[]>{const result:PartProof[]=[];for(const [path,raw]of [...parts].sort(([a],[b])=>a<b?-1:a>b?1:0)){remaining(budget);const hash=await sha256(raw);remaining(budget);result.push({path,bytes:raw.length,sha256:hash});}return result;}
async function openDonor(raw:Uint8Array,stream:Stream,budget:Budget,xml:XmlRuntime){const metadata=OFFICIAL_TEMPLATES[stream];if(raw.length!==metadata.donor_bytes)return refuse('TEMPLATE_CHANGED');const hash=await sha256(raw);remaining(budget);if(hash!==metadata.donor_sha256)return refuse('TEMPLATE_CHANGED');const donor=await readZipParts(raw,budget),proofs=await partProofs(donor.parts,budget);if(proofs.length!==metadata.parts.length)return refuse('TEMPLATE_CHANGED');for(const expected of metadata.parts){const actual=proofs.find(p=>p.path===expected.path);if(!actual||actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)return refuse('TEMPLATE_CHANGED');}const native=verifyNativeStructure(donor.parts,stream,xml);remaining(budget);return {...donor,native};}
function expectedSheet(donor:ReadonlyMap<string,Uint8Array>,batch:MappedBatch):Uint8Array{const path=OFFICIAL_TEMPLATES[batch.context.stream].sheet_path,raw=donor.get(path);if(!raw)return refuse();return utf8(fillTargetRows(decodeUtf8(raw,BOUNDS.xmlBytes),batch.context.stream,batch.rows.map(row=>row.cells)),BOUNDS.xmlBytes);}
async function readback(output:Uint8Array,donor:ReadonlyMap<string,Uint8Array>,native:VerifiedPublicDonorStructure,batch:MappedBatch,budget:Budget,xml:XmlRuntime):Promise<PartProof[]>{
 const metadata=OFFICIAL_TEMPLATES[batch.context.stream],actual=await readZipParts(output,budget);if(actual.parts.size!==donor.size)return refuse();const expected=expectedSheet(donor,batch);
 for(const [path,old]of donor){const raw=actual.parts.get(path),wanted=path===metadata.sheet_path?expected:old;if(!raw||raw.length!==wanted.length||raw.some((v,i)=>v!==wanted[i]))return refuse();remaining(budget);}
 // All non-target part bytes and the entire expected target XML were just compared.
 // Their native dictionaries/names/validations cannot change; do not parse them twice.
 const required=(parts:ReadonlyMap<string,Uint8Array>,path:string)=>{const raw=parts.get(path);if(!raw)return refuse();return raw;};
 verifyWrittenCells(parseXml(required(actual.parts,metadata.sheet_path),xml),native.sheet,batch.context.stream,batch.rows.map(row=>row.cells),native.strings,native.styles);remaining(budget);
 return partProofs(actual.parts,budget);
}
/** The single writer used by both fresh genuine projections and a trusted persisted
 * mapped capture. It does not allocate, sign, register or change database state. */
async function writeMapped(batch:MappedBatch,raw:Uint8Array,budget:Budget,xml:XmlRuntime):Promise<WorkbookOutput>{
 const donor=await openDonor(raw,batch.context.stream,budget,xml),metadata=OFFICIAL_TEMPLATES[batch.context.stream],sheet=expectedSheet(donor.parts,batch),old=donor.zip.file(metadata.sheet_path);if(!old)return refuse();
 // JSZip checks the local Uint8Array realm; copy encoder bytes without changing them.
 donor.zip.file(metadata.sheet_path,new Uint8Array(sheet),{date:new Date(old.date.getTime()),comment:old.comment??undefined,unixPermissions:old.unixPermissions??undefined,dosPermissions:old.dosPermissions??undefined,createFolders:false,binary:true});
 const output=await boundedStream(donor.zip.generateInternalStream({type:'uint8array',platform:'DOS',compression:'DEFLATE',compressionOptions:{level:6},streamFiles:false,comment:(donor.zip as typeof donor.zip & {comment?:string|null}).comment??''}),BOUNDS.zipBytes,budget);remaining(budget);
 const parts=await readback(output,donor.parts,donor.native,batch,budget,xml),byte_sha256=await sha256(output);remaining(budget);
 return {template_id:metadata.id,root_sha256:batch.root_sha256,bytes:output,byte_sha256,byte_size:output.length,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',signing:{status:'not_verified'},row_count:batch.rows.length,parts};
}
async function verifyMapped(batch:MappedBatch,donorCopy:Uint8Array,copy:Uint8Array,budget:Budget,xml:XmlRuntime){
 const donor=await openDonor(donorCopy,batch.context.stream,budget,xml),parts=await readback(copy,donor.parts,donor.native,batch,budget,xml),byte_sha256=await sha256(copy);remaining(budget);return {root_sha256:batch.root_sha256,byte_sha256,byte_size:copy.length,parts,signing:{status:'not_verified' as const}};
}
/** Existing projection entry remains browser-default and uses the same whole45s budget. */
export async function generateOfficialWorkbook(input:unknown,donorBytes:Uint8Array,guard:CurrentGuard,options:WorkbookRuntimeOptions={}):Promise<WorkbookOutput>{
 ensureCurrent(guard);if(!(donorBytes instanceof Uint8Array)||donorBytes.length>BOUNDS.zipBytes)return refuse('LIMIT_EXCEEDED');const raw=new Uint8Array(donorBytes),budget=newBudget(guard),xml=options.xml??browserXmlRuntime,batch=await mapFrozenProjections(input,guard);remaining(budget);if(!batch.ready)return refuse('READINESS_BLOCKED');return writeMapped(batch,raw,budget,xml);
}
export async function verifyOfficialWorkbook(input:unknown,donorBytes:Uint8Array,outputBytes:Uint8Array,guard:CurrentGuard,options:WorkbookRuntimeOptions={}){
 ensureCurrent(guard);if(!(donorBytes instanceof Uint8Array)||!(outputBytes instanceof Uint8Array)||donorBytes.length>BOUNDS.zipBytes||outputBytes.length>BOUNDS.zipBytes)return refuse('LIMIT_EXCEEDED');const donorCopy=new Uint8Array(donorBytes),copy=new Uint8Array(outputBytes),budget=newBudget(guard),xml=options.xml??browserXmlRuntime,batch=await mapFrozenProjections(input,guard);remaining(budget);if(!batch.ready)return refuse('READINESS_BLOCKED');return verifyMapped(batch,donorCopy,copy,budget,xml);
}
/** Internal checksum validation grants no authority. The trusted orchestrator must
 * first revalidate original actor, all subjects, exact sourceCAS and persisted capture.
 * No caller metadata hash, local passed flag or fake reconstructed UC019 DTO is used. */
export async function generateMappedOfficialWorkbook(input:unknown,donorBytes:Uint8Array,guard:CurrentGuard,options:WorkbookRuntimeOptions):Promise<WorkbookOutput>{
 ensureCurrent(guard);if(!(donorBytes instanceof Uint8Array)||donorBytes.length>BOUNDS.zipBytes)return refuse('LIMIT_EXCEEDED');const raw=new Uint8Array(donorBytes),budget=newBudget(guard),xml=options.xml??browserXmlRuntime,batch=await verifySealedMappedBatch(input,guard,()=>{remaining(budget);});remaining(budget);return writeMapped(batch,raw,budget,xml);
}
export async function verifyMappedOfficialWorkbook(input:unknown,donorBytes:Uint8Array,outputBytes:Uint8Array,guard:CurrentGuard,options:WorkbookRuntimeOptions){
 ensureCurrent(guard);if(!(donorBytes instanceof Uint8Array)||!(outputBytes instanceof Uint8Array)||donorBytes.length>BOUNDS.zipBytes||outputBytes.length>BOUNDS.zipBytes)return refuse('LIMIT_EXCEEDED');const donorCopy=new Uint8Array(donorBytes),copy=new Uint8Array(outputBytes),budget=newBudget(guard),xml=options.xml??browserXmlRuntime,batch=await verifySealedMappedBatch(input,guard,()=>{remaining(budget);});remaining(budget);return verifyMapped(batch,donorCopy,copy,budget,xml);
}
