import{z}from'zod';
import{ARCHIVE_MAX_MANIFEST_BYTES,ARCHIVE_MAX_FILE_BYTES,ArchiveError,archiveInstant,archiveUuid,archiveHash,archiveScope,archivePackageSummary,archiveManifest,type ArchiveScope,type ArchiveCurrentGuard,type ArchiveManifest}from'./contract.ts';
import{archiveSha256,archiveUtf8,canonicalArchiveJson,verifyArchivePackage,type ArchivePackageBytes,type VerifiedArchivePackage}from'./package.ts';
const manifestContext=z.object({version:z.literal(1),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,package:archivePackageSummary,manifest_json:z.string().min(1).max(ARCHIVE_MAX_MANIFEST_BYTES)}).strict();
const fileContext=z.object({version:z.literal(1),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,package_id:archiveUuid,manifest_sha256:archiveHash,file_id:archiveUuid,bucket:z.literal('archive-case-artifacts'),path:z.string().min(1).max(500),object_id:archiveUuid,object_updated_at:archiveInstant,byte_sha256:archiveHash,byte_size:z.number().int().min(1).max(ARCHIVE_MAX_FILE_BYTES),mime_type:z.string().min(1).max(120)}).strict();
export type ArchiveSealedFileContext=z.infer<typeof fileContext>;
export interface ArchiveSealedReadPort extends ArchiveCurrentGuard{
 observedActorId:string;organizationId:string;scope:ArchiveScope;packageId:string;
 manifestContext():Promise<unknown>;fileContext(fileId:string):Promise<unknown>;
 /** The fixed database descriptor is the only permitted byte address. No browser-supplied locator. */
 downloadExact(context:ArchiveSealedFileContext):Promise<Uint8Array>;
}
const same=(a:object,b:object)=>canonicalArchiveJson(a)===canonicalArchiveJson(b);
function identity(value:Pick<z.infer<typeof manifestContext>,'actor_id'|'organization_id'|'scope'>,port:ArchiveSealedReadPort):void{if(value.actor_id!==port.observedActorId||value.organization_id!==port.organizationId||!same(value.scope,port.scope))throw new ArchiveError('SOURCE_CHANGED');}
export async function readSealedArchiveManifest(port:ArchiveSealedReadPort):Promise<{manifest:ArchiveManifest;bytes:Uint8Array;sha256:string}>{
 port.assertCurrent();const response=manifestContext.safeParse(await port.manifestContext());port.assertCurrent();if(!response.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const value=response.data;identity(value,port);
 if(value.package.id!==port.packageId||value.package.organization_id!==port.organizationId||value.package.phase!=='sealed'||!value.package.manifest_sha256)throw new ArchiveError('SOURCE_CHANGED');
 const bytes=new TextEncoder().encode(value.manifest_json);if(bytes.byteLength>ARCHIVE_MAX_MANIFEST_BYTES||bytes.byteLength!==value.package.manifest_bytes)throw new ArchiveError('LIMIT_EXCEEDED');
 if(await archiveSha256(bytes)!==value.package.manifest_sha256)throw new ArchiveError('HASH_MISMATCH');port.assertCurrent();let manifest:ArchiveManifest;
 try{manifest=archiveManifest.parse(JSON.parse(value.manifest_json));}catch{throw new ArchiveError('PACKAGE_INCOMPLETE');}
 if(manifest.package_id!==port.packageId||manifest.organization_id!==port.organizationId||manifest.case_id!==value.package.case_id||manifest.case_revision!==value.package.input_revision||manifest.case_state_hash!==value.package.input_state_hash||manifest.completeness!==value.package.completeness||!same(manifest.blockers,value.package.blockers))throw new ArchiveError('SOURCE_CHANGED');
 if(new TextDecoder().decode(archiveUtf8(manifest))!==value.manifest_json)throw new ArchiveError('HASH_MISMATCH');
 const late=manifestContext.safeParse(await port.manifestContext());port.assertCurrent();if(!late.success||!same(late.data,value))throw new ArchiveError('SOURCE_CHANGED');identity(late.data,port);return{manifest,bytes,sha256:value.package.manifest_sha256};
}
export async function readSealedArchiveFile(port:ArchiveSealedReadPort,fileId:string,expected?:{byte_sha256:string;byte_size:number;manifest_sha256:string}):Promise<Uint8Array>{
 port.assertCurrent();if(!archiveUuid.safeParse(fileId).success)throw new ArchiveError('INVALID_INPUT');const parsed=fileContext.safeParse(await port.fileContext(fileId));port.assertCurrent();if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const value=parsed.data;identity(value,port);
 if(value.package_id!==port.packageId||value.file_id!==fileId||value.path!==port.organizationId+'/'+port.packageId+'/files/'+fileId+'/'+value.byte_sha256+'.bin'||expected&&(value.byte_sha256!==expected.byte_sha256||value.byte_size!==expected.byte_size||value.manifest_sha256!==expected.manifest_sha256))throw new ArchiveError('SOURCE_CHANGED');
 const bytes=(await port.downloadExact(value)).slice();port.assertCurrent();if(bytes.byteLength!==value.byte_size||await archiveSha256(bytes)!==value.byte_sha256)throw new ArchiveError('HASH_MISMATCH');port.assertCurrent();
 const late=fileContext.safeParse(await port.fileContext(fileId));port.assertCurrent();if(!late.success||!same(late.data,value))throw new ArchiveError('SOURCE_CHANGED');identity(late.data,port);return bytes;
}
export async function loadSealedArchivePackage(port:ArchiveSealedReadPort):Promise<{input:ArchivePackageBytes;verified:VerifiedArchivePackage}>{
 const header=await readSealedArchiveManifest(port);const files=new Map<string,Uint8Array>();
 for(const file of header.manifest.files){port.assertCurrent();files.set(file.archive_path,await readSealedArchiveFile(port,file.id,{byte_sha256:file.byte_sha256,byte_size:file.byte_size,manifest_sha256:header.sha256}));}
 const input={manifest_bytes:header.bytes,manifest_sha256:header.sha256,files};const verified=await verifyArchivePackage(input,port);port.assertCurrent();
 const late=await readSealedArchiveManifest(port);if(late.sha256!==header.sha256||!same(late.manifest,header.manifest))throw new ArchiveError('SOURCE_CHANGED');return{input,verified};
}
