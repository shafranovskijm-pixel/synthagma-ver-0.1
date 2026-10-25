import{z}from'zod';
import{ARCHIVE_MAX_FILE_BYTES,ArchiveError,archiveCase,archiveCapturedEvent,archiveCapturedRecord,archiveMember,archiveDisposalJournal,archiveErrorCode,archiveHash,archiveInstant,archivePackageSummary,archiveUuid,type ArchiveManifest,type ArchiveFile,type ArchiveCurrentGuard}from'./contract.ts';
import{archiveSha256,archiveUtf8,canonicalArchiveJson,serializeArchiveManifest,verifyArchivePackage}from'./package.ts';
const safePath=z.string().min(1).max(2000).refine(value=>!/[?#\\\u0000-\u001f]/.test(value)&&!/%(?:2e|2f|5c|00|0[1-9a-f]|1[0-9a-f]|25)/i.test(value)&&!value.includes('://')&&!value.startsWith('/')&&!value.split('/').some(p=>p==='.'||p==='..'));
const mime=z.string().max(120).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i);
const people=z.array(archiveUuid).max(10000);
const protectedRequest=z.object({version:z.literal(1),action:z.literal('read_file'),address:z.object({kind:z.literal('authenticated_signature'),organization_id:archiveUuid,signature_id:archiveUuid,chosen_party:z.enum(['sender','recipient'])}).strict(),file_kind:z.enum(['source','scan']),binding_id:archiveUuid,event_revision:z.number().int().positive().nullable(),expected_document_revision_id:archiveUuid.nullable(),document_html_sha256:archiveHash}).strict().refine(v=>(v.file_kind==='source')===(v.event_revision===null));
export const archivePrivateFile=z.union([
 z.object({bucket:z.enum(['org-documents','admission-case-evidence','frdo-packet-artifacts']),path:safePath,object_id:archiveUuid,object_updated_at:archiveInstant,byte_size:z.number().int().min(1).max(ARCHIVE_MAX_FILE_BYTES),mime_type:mime,known_sha256:archiveHash.optional(),retained_people:people.optional(),attribution_actors:people.optional()}).strict(),
 z.object({kind:z.literal('signature_protected_v1'),logical_file_id:archiveUuid,protected_request:protectedRequest,byte_size:z.number().int().min(1).max(20*1024*1024),mime_type:mime,known_sha256:archiveHash}).strict(),
]);
export type ArchivePrivateFile=z.infer<typeof archivePrivateFile>;
export type ArchiveStorageFile=z.infer<(typeof archivePrivateFile.options)[0]>;
const mapping=z.object({file_id:archiveUuid,private_file:archivePrivateFile}).strict();
const contextV1=z.object({schema_version:z.literal(1),build:archivePackageSummary,actor_id:archiveUuid,request_id:archiveUuid,case_snapshot:archiveCase,case_events:z.array(archiveCapturedEvent).max(100000),records:z.array(archiveCapturedRecord).max(10000),private_files:z.array(mapping).max(10000),blockers:z.array(archiveErrorCode).max(100),created_at:archiveInstant,lease_id:archiveUuid,lease_until:archiveInstant}).strict();
const contextV2=contextV1.extend({schema_version:z.literal(2),supplementary_members:z.array(archiveMember).max(10000),disposal_journal:archiveDisposalJournal}).strict();
const context=z.discriminatedUnion('schema_version',[contextV1,contextV2]);
export interface ArchiveCopiedFile{id:string;member_id:string;object_id:string;object_updated_at:string;byte_sha256:string;byte_size:number;mime_type:string;readback_sha256:string}
export interface ArchivePackageWorkerPort extends ArchiveCurrentGuard{
 /** This identity is observed from the original JWT by getUser; it is never an HTTP body claim. */
 observedActorId:string;organizationId:string;packageId:string;requestId:string;
 claim():Promise<unknown>;currentContext():Promise<unknown>;
 /** Compare the actual object identity/epoch before AND after original-authorized byte read. */
 readStorageExact(file:ArchiveStorageFile):Promise<Uint8Array>;
 /** Calls signature-protected-file with the original JWT. No direct Storage or service download fallback. */
 readSignatureProtected(request:z.infer<typeof protectedRequest>):Promise<Uint8Array>;
 putArchiveFile(input:{file_id:string;member_id:string;lease_id:string;byte_sha256:string;bytes:Uint8Array;mime_type:string}):Promise<{object_id:string;object_updated_at:string}>;
 readArchiveFile(file_id:string,lease_id:string):Promise<Uint8Array>;
 seal(input:{lease_id:string;manifest:ArchiveManifest;manifest_sha256:string;manifest_bytes:number;files:ArchiveCopiedFile[]}):Promise<unknown>;
}
function parsedContext(raw:unknown,port:ArchivePackageWorkerPort){const result=context.safeParse(raw);if(!result.success)throw new ArchiveError('SOURCE_UNAVAILABLE');const value=result.data;if(value.actor_id!==port.observedActorId||value.request_id!==port.requestId||value.build.actor_id!==undefined&&value.build.actor_id!==port.observedActorId||value.build.request_id!==undefined&&value.build.request_id!==port.requestId||value.build.id!==port.packageId||value.build.organization_id!==port.organizationId||value.case_snapshot.organization_id!==port.organizationId||value.case_snapshot.id!==value.build.case_id||value.case_snapshot.revision!==value.build.input_revision||value.case_snapshot.state_hash!==value.build.input_state_hash)throw new ArchiveError('SOURCE_CHANGED');if(value.private_files.some(file=>'kind'in file.private_file&&file.private_file.protected_request.address.organization_id!==port.organizationId))throw new ArchiveError('SOURCE_CHANGED');return value;}
/** Copies frozen records and exact source bytes; hashes/readback are checked before the fixed trusted seal. */
export async function buildArchivePackage(port:ArchivePackageWorkerPort):Promise<unknown>{
 port.assertCurrent();const captured=parsedContext(await port.claim(),port);port.assertCurrent();if(captured.build.phase==='sealed')return captured.build;
 if(captured.build.phase!=='generating'||Date.parse(captured.lease_until)<=Date.now())throw new ArchiveError('SOURCE_CHANGED');
 const original=canonicalArchiveJson(captured);const fresh=async()=>{port.assertCurrent();const value=parsedContext(await port.currentContext(),port);port.assertCurrent();if(canonicalArchiveJson(value)!==original||Date.parse(value.lease_until)<=Date.now())throw new ArchiveError('SOURCE_CHANGED');};
 const members=captured.schema_version===2?[...captured.case_snapshot.members,...captured.supplementary_members]:captured.case_snapshot.members;
 const copied:ArchiveCopiedFile[]=[],files:ArchiveFile[]=[],bytesByPath=new Map<string,Uint8Array>();
 for(const input of captured.private_files){await fresh();const member=members.find(m=>m.file_ids.includes(input.file_id));if(!member)throw new ArchiveError('PACKAGE_INCOMPLETE');const descriptor=input.private_file;
  const bytes=('kind'in descriptor?await port.readSignatureProtected(descriptor.protected_request):await port.readStorageExact(descriptor)).slice();port.assertCurrent();
  if(bytes.byteLength!==descriptor.byte_size)throw new ArchiveError('SOURCE_CHANGED');const hash=await archiveSha256(bytes);port.assertCurrent();if(descriptor.known_sha256&&hash!==descriptor.known_sha256)throw new ArchiveError('HASH_MISMATCH');await fresh();
  const stored=await port.putArchiveFile({file_id:input.file_id,member_id:member.id,lease_id:captured.lease_id,byte_sha256:hash,bytes:bytes.slice(),mime_type:descriptor.mime_type});port.assertCurrent();if(!archiveUuid.safeParse(stored.object_id).success||!archiveInstant.safeParse(stored.object_updated_at).success)throw new ArchiveError('SOURCE_UNAVAILABLE');await fresh();const readback=await port.readArchiveFile(input.file_id,captured.lease_id);port.assertCurrent();if(readback.byteLength!==bytes.byteLength||await archiveSha256(readback)!==hash)throw new ArchiveError('HASH_MISMATCH');await fresh();
  const file:ArchiveFile={id:input.file_id,member_id:member.id,source:member.source,byte_sha256:hash,byte_size:bytes.byteLength,mime_type:descriptor.mime_type,original_name:input.file_id+'.bin',archive_path:'files/'+input.file_id+'/'+hash+'.bin'};files.push(file);bytesByPath.set(file.archive_path,readback.slice());copied.push({id:file.id,member_id:member.id,object_id:stored.object_id,object_updated_at:stored.object_updated_at,byte_sha256:hash,byte_size:file.byte_size,mime_type:file.mime_type,readback_sha256:hash});
 }
 const manifest:ArchiveManifest={...(captured.schema_version===2?{schema_version:2 as const,supplementary_members:captured.supplementary_members,disposal_journal:captured.disposal_journal}:{schema_version:1 as const}),package_id:port.packageId,organization_id:port.organizationId,case_id:captured.case_snapshot.id,case_revision:captured.case_snapshot.revision,case_state_hash:captured.case_snapshot.state_hash,created_at:captured.created_at,completeness:captured.blockers.length?'partial':'complete',case_snapshot:captured.case_snapshot,members,case_events:captured.case_events,records:captured.records,files,missing_member_ids:[],blockers:captured.blockers};
 const serialized=await serializeArchiveManifest(manifest,port);await verifyArchivePackage({manifest_bytes:serialized.bytes,manifest_sha256:serialized.sha256,files:bytesByPath},port);await fresh();const result=await port.seal({lease_id:captured.lease_id,manifest:serialized.manifest,manifest_sha256:serialized.sha256,manifest_bytes:serialized.bytes.byteLength,files:copied});port.assertCurrent();return result;
}
