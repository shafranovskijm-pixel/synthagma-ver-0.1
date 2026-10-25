import{ARCHIVE_MAX_MANIFEST_BYTES,ArchiveError,archiveManifest,archiveUuid,type ArchiveManifest,type ArchiveJson,type ArchiveCurrentGuard,type ArchiveDisposalJournal}from'./contract.ts';
export function canonicalArchiveJson(value:ArchiveJson|object):string{
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw new ArchiveError('INVALID_INPUT');return JSON.stringify(value);}
 if(Array.isArray(value))return'['+value.map(canonicalArchiveJson).join(',')+']';
 if(typeof value==='object'){const record=value as Record<string,ArchiveJson>;return'{'+Object.keys(record).sort().map(key=>JSON.stringify(key)+':'+canonicalArchiveJson(record[key])).join(',')+'}';}
 throw new ArchiveError('INVALID_INPUT');
}
export async function archiveSha256(bytes:Uint8Array):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export const archiveUtf8=(value:ArchiveJson|object)=>new TextEncoder().encode(canonicalArchiveJson(value));
const equalBytes=(a:Uint8Array,b:Uint8Array)=>a.byteLength===b.byteLength&&a.every((value,index)=>value===b[index]);
function safeMetadata(value:unknown,depth=0):void{
 if(depth>40)throw new ArchiveError('LIMIT_EXCEEDED');
 if(typeof value==='string'&&(/\bBearer[ \t]+[A-Za-z0-9._-]{8,}/i.test(value)||/https?:\/\/[^\s]*[?&](?:token|signature|x-amz-signature|x-goog-signature)=/i.test(value)))throw new ArchiveError('INVALID_INPUT');
 if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){if(!Array.isArray(value)&&/^(?:access_token|refresh_token|authorization|password|service_role_key|apikey|signed_url|download_url|storage_path|private_key)$/i.test(key))throw new ArchiveError('INVALID_INPUT');safeMetadata(child,depth+1);}
}
export async function serializeArchiveManifest(raw:ArchiveManifest,guard:ArchiveCurrentGuard):Promise<{manifest:ArchiveManifest;bytes:Uint8Array;sha256:string}>{
 guard.assertCurrent();let manifest:ArchiveManifest;try{manifest=archiveManifest.parse(raw);}catch{throw new ArchiveError('INVALID_INPUT');}safeMetadata(manifest);const bytes=archiveUtf8(manifest);if(bytes.byteLength>ARCHIVE_MAX_MANIFEST_BYTES)throw new ArchiveError('LIMIT_EXCEEDED');const sha256=await archiveSha256(bytes);guard.assertCurrent();return{manifest,bytes,sha256};
}
export interface ArchivePackageBytes{manifest_bytes:Uint8Array;manifest_sha256:string;files:ReadonlyMap<string,Uint8Array>}
export interface VerifiedArchivePackage{manifest:ArchiveManifest;manifest_sha256:string;status:'verified_complete'|'verified_partial';file_count:number;byte_count:number;files:ReadonlyMap<string,Uint8Array>}
/** Verifies original bytes and captured graph; a hash is integrity evidence, not legal approval or authentication. */
export async function verifyArchivePackage(input:ArchivePackageBytes,guard:ArchiveCurrentGuard):Promise<VerifiedArchivePackage>{
 guard.assertCurrent();const manifestBytes=input.manifest_bytes.slice(),inputFiles=new Map(input.files),manifestHash=input.manifest_sha256;if(manifestBytes.byteLength>ARCHIVE_MAX_MANIFEST_BYTES)throw new ArchiveError('LIMIT_EXCEEDED');if(!/^[0-9a-f]{64}$/.test(manifestHash)||await archiveSha256(manifestBytes)!==manifestHash)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();
 let manifest:ArchiveManifest;try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes);manifest=archiveManifest.parse(JSON.parse(raw));}catch{throw new ArchiveError('INVALID_INPUT');}
 safeMetadata(manifest);if(!equalBytes(archiveUtf8(manifest),manifestBytes))throw new ArchiveError('INVALID_INPUT');
 if(inputFiles.size!==manifest.files.length||[...inputFiles.keys()].some(key=>!manifest.files.some(file=>file.archive_path===key)))throw new ArchiveError('PACKAGE_INCOMPLETE');
 for(const event of manifest.case_events){guard.assertCurrent();if(await archiveSha256(archiveUtf8(event.payload))!==event.payload_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();}
 for(const record of manifest.records){guard.assertCurrent();if(await archiveSha256(archiveUtf8(record.record_data))!==record.record_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();for(const event of record.events){if(await archiveSha256(archiveUtf8(event.payload))!==event.payload_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();}}
 if(manifest.schema_version===2){const journal=manifest.disposal_journal;for(const row of journal.revisions){guard.assertCurrent();if(await archiveSha256(archiveUtf8(row.record_data))!==row.record_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();}const {journal_sha256,...body}=journal;if(await archiveSha256(archiveUtf8(body))!==journal_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();}
 let byte_count=0;const verified=new Map<string,Uint8Array>();for(const file of manifest.files){guard.assertCurrent();const original=inputFiles.get(file.archive_path),bytes=original?.slice();if(!bytes||bytes.byteLength!==file.byte_size)throw new ArchiveError('PACKAGE_INCOMPLETE');if(await archiveSha256(bytes)!==file.byte_sha256)throw new ArchiveError('HASH_MISMATCH');guard.assertCurrent();byte_count+=bytes.byteLength;if(!Number.isSafeInteger(byte_count))throw new ArchiveError('LIMIT_EXCEEDED');verified.set(file.archive_path,bytes.slice());}
 return{manifest,manifest_sha256:manifestHash,status:manifest.completeness==='complete'?'verified_complete':'verified_partial',file_count:verified.size,byte_count,files:verified};
}
export interface ArchiveQuarantinePort extends ArchiveCurrentGuard{
 target_kind:'isolated_archive_quarantine_v1';restore_id:string;source_organization_id:string;target_organization_id:string;
 writeImmutable(path:string,bytes:Uint8Array):Promise<void>;readImmutable(path:string):Promise<Uint8Array>;
 saveProjection(projection:ArchiveQuarantineProjection):Promise<void>;readProjection():Promise<ArchiveQuarantineProjection>;
}
export interface ArchiveQuarantineProjection{schema_version:1|2;disposal_journal?:ArchiveDisposalJournal;supplementary_members?:ArchiveManifest['members'];restore_id:string;source_organization_id:string;target_organization_id:string;source_case_id:string;source_manifest_sha256:string;historical_only:true;case_snapshot:ArchiveManifest['case_snapshot'];case_events:ArchiveManifest['case_events'];records:ArchiveManifest['records'];file_map:{file_id:string;original_path:string;quarantine_path:string;byte_sha256:string;byte_size:number}[]}
export interface ArchiveRestoreReceipt{status:'restored_isolated'|'incomplete';restore_id:string;source_manifest_sha256:string;verified_file_ids:string[];record_count:number;blockers:ArchiveError['code'][];live_business_actions:0;source_reissued:false;physical_cleanup_claim:false}
/** Writes a historical projection only. It never invokes live enrollment, issuance, quotas or user-creation APIs. */
export async function restoreArchiveIntoQuarantine(input:ArchivePackageBytes,port:ArchiveQuarantinePort):Promise<ArchiveRestoreReceipt>{
 port.assertCurrent();const verified=await verifyArchivePackage(input,port);port.assertCurrent();if(verified.status!=='verified_complete')throw new ArchiveError('PACKAGE_INCOMPLETE');if(port.target_kind!=='isolated_archive_quarantine_v1'||port.source_organization_id!==verified.manifest.organization_id||!archiveUuid.safeParse(port.restore_id).success||!archiveUuid.safeParse(port.target_organization_id).success)throw new ArchiveError('RESTORE_MAPPING_REQUIRED');
 const receipt:ArchiveRestoreReceipt={status:'incomplete',restore_id:port.restore_id,source_manifest_sha256:verified.manifest_sha256,verified_file_ids:[],record_count:0,blockers:[],live_business_actions:0,source_reissued:false,physical_cleanup_claim:false};
 const file_map:ArchiveQuarantineProjection['file_map']=[];
 try{for(const file of verified.manifest.files){port.assertCurrent();const quarantine_path='quarantine/'+port.restore_id+'/'+file.archive_path;const bytes=verified.files.get(file.archive_path)!;await port.writeImmutable(quarantine_path,bytes.slice());port.assertCurrent();const readback=await port.readImmutable(quarantine_path);port.assertCurrent();if(readback.byteLength!==file.byte_size||await archiveSha256(readback)!==file.byte_sha256)throw new ArchiveError('HASH_MISMATCH');port.assertCurrent();file_map.push({file_id:file.id,original_path:file.archive_path,quarantine_path,byte_sha256:file.byte_sha256,byte_size:file.byte_size});receipt.verified_file_ids.push(file.id);}
 const projection:ArchiveQuarantineProjection={...(verified.manifest.schema_version===2?{schema_version:2 as const,disposal_journal:verified.manifest.disposal_journal,supplementary_members:verified.manifest.supplementary_members}:{schema_version:1 as const}),restore_id:port.restore_id,source_organization_id:port.source_organization_id,target_organization_id:port.target_organization_id,source_case_id:verified.manifest.case_id,source_manifest_sha256:verified.manifest_sha256,historical_only:true,case_snapshot:verified.manifest.case_snapshot,case_events:verified.manifest.case_events,records:verified.manifest.records,file_map};const originalProjection=canonicalArchiveJson(projection);port.assertCurrent();await port.saveProjection(JSON.parse(originalProjection));port.assertCurrent();const saved=await port.readProjection();port.assertCurrent();if(canonicalArchiveJson(saved)!==originalProjection)throw new ArchiveError('HASH_MISMATCH');receipt.record_count=projection.records.length;receipt.status='restored_isolated';return receipt;
 }catch(error){port.assertCurrent();receipt.blockers=[error instanceof ArchiveError?error.code:'DEPENDENCY_UNAVAILABLE'];return receipt;}
}
