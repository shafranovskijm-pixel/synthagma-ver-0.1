import{z}from'zod';
import{ArchiveError,archiveUuid,archiveInstant,archiveScope,archiveRestore,archiveManifest,type ArchiveCurrentGuard}from'./contract.ts';
import{canonicalArchiveJson,archiveSha256}from'./package.ts';
import{loadSealedArchivePackage,type ArchiveSealedReadPort}from'./sealedRead.ts';
const restoreContext=z.object({version:z.literal(1),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,restore:archiveRestore,manifest_json:z.string().max(4194304),lease_id:archiveUuid.nullable(),lease_until:archiveInstant.nullable()}).strict();
export interface ArchiveRestoredFileProof{file_id:string;object_id:string;object_updated_at:string;byte_sha256:string;byte_size:number;mime_type:string;readback_sha256:string}
export interface ArchiveRestoreWorkerPort extends ArchiveSealedReadPort,ArchiveCurrentGuard{
 restoreId:string;requestId:string;
 claimRestore():Promise<unknown>;currentRestoreContext():Promise<unknown>;
 putQuarantineFile(file:{file_id:string;lease_id:string;byte_sha256:string;bytes:Uint8Array;mime_type:string}):Promise<{object_id:string;object_updated_at:string}>;
 readQuarantineFile(file_id:string,lease_id:string):Promise<Uint8Array>;
 commitRestore(input:{lease_id:string;manifest_sha256:string;files:ArchiveRestoredFileProof[]}):Promise<unknown>;
}
function parse(raw:unknown,port:ArchiveRestoreWorkerPort){const parsed=restoreContext.safeParse(raw);if(!parsed.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const value=parsed.data;if(value.actor_id!==port.observedActorId||value.organization_id!==port.organizationId||canonicalArchiveJson(value.scope)!==canonicalArchiveJson(port.scope)||value.restore.id!==port.restoreId||value.restore.package_id!==port.packageId||value.restore.organization_id!==port.organizationId||value.restore.actor_id!==port.observedActorId||value.restore.request_id!==port.requestId)throw new ArchiveError('SOURCE_CHANGED');return value;}
/** Restores complete sealed bytes into a separate immutable namespace and inert projection rows only. */
export async function restorePersistedArchive(port:ArchiveRestoreWorkerPort):Promise<z.infer<typeof archiveRestore>>{
 port.assertCurrent();const capture=parse(await port.claimRestore(),port);port.assertCurrent();
 const manifestBytes=new TextEncoder().encode(capture.manifest_json);if(await archiveSha256(manifestBytes)!==capture.restore.manifest_sha256)throw new ArchiveError('HASH_MISMATCH');port.assertCurrent();let pinnedManifest:z.infer<typeof archiveManifest>;try{pinnedManifest=archiveManifest.parse(JSON.parse(capture.manifest_json));}catch{throw new ArchiveError('PACKAGE_INCOMPLETE');}
 if(pinnedManifest.organization_id!==port.organizationId||pinnedManifest.package_id!==port.packageId||pinnedManifest.completeness!=='complete')throw new ArchiveError('PACKAGE_INCOMPLETE');
 if(capture.restore.state==='verified'){if(capture.restore.verified_file_ids.length!==pinnedManifest.files.length||pinnedManifest.files.some(file=>!capture.restore.verified_file_ids.includes(file.id)))throw new ArchiveError('PACKAGE_INCOMPLETE');const late=parse(await port.currentRestoreContext(),port);port.assertCurrent();if(canonicalArchiveJson(late)!==canonicalArchiveJson(capture))throw new ArchiveError('SOURCE_CHANGED');return capture.restore;}
 if(capture.restore.state!=='verifying'||!capture.lease_id||!capture.lease_until||Date.parse(capture.lease_until)<=Date.now())throw new ArchiveError('SOURCE_CHANGED');
 const captured=canonicalArchiveJson(capture);const leaseId=capture.lease_id;
 const fresh=async()=>{port.assertCurrent();const value=parse(await port.currentRestoreContext(),port);port.assertCurrent();if(canonicalArchiveJson(value)!==captured||!value.lease_until||Date.parse(value.lease_until)<=Date.now())throw new ArchiveError('SOURCE_CHANGED');};
 const original=await loadSealedArchivePackage(port);if(original.verified.status!=='verified_complete')throw new ArchiveError('PACKAGE_INCOMPLETE');
 if(original.verified.manifest_sha256!==capture.restore.manifest_sha256||new TextDecoder().decode(original.input.manifest_bytes)!==capture.manifest_json)throw new ArchiveError('SOURCE_CHANGED');
 const proofs:ArchiveRestoredFileProof[]=[];
 for(const file of original.verified.manifest.files){await fresh();const bytes=original.verified.files.get(file.archive_path)!;const object=await port.putQuarantineFile({file_id:file.id,lease_id:leaseId,byte_sha256:file.byte_sha256,bytes:bytes.slice(),mime_type:file.mime_type});port.assertCurrent();if(!archiveUuid.safeParse(object.object_id).success||!archiveInstant.safeParse(object.object_updated_at).success)throw new ArchiveError('SOURCE_UNAVAILABLE');await fresh();
  const readback=await port.readQuarantineFile(file.id,leaseId);port.assertCurrent();if(readback.byteLength!==file.byte_size||await archiveSha256(readback)!==file.byte_sha256)throw new ArchiveError('HASH_MISMATCH');await fresh();proofs.push({file_id:file.id,object_id:object.object_id,object_updated_at:object.object_updated_at,byte_sha256:file.byte_sha256,byte_size:file.byte_size,mime_type:file.mime_type,readback_sha256:file.byte_sha256});}
 await fresh();const result=archiveRestore.safeParse(await port.commitRestore({lease_id:leaseId,manifest_sha256:capture.restore.manifest_sha256,files:proofs}));port.assertCurrent();if(!result.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const value=result.data;
 if(value.id!==port.restoreId||value.package_id!==port.packageId||value.actor_id!==port.observedActorId||value.organization_id!==port.organizationId||value.request_id!==port.requestId||value.manifest_sha256!==capture.restore.manifest_sha256||value.state!=='verified'||!value.projection_sha256||!value.completed_at||value.verified_file_ids.length!==proofs.length||proofs.some(proof=>!value.verified_file_ids.includes(proof.file_id)))throw new ArchiveError('SOURCE_CHANGED');return value;
}
