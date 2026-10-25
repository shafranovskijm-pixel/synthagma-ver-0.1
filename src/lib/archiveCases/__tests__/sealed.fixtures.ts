import{vi}from'vitest';
import{ArchiveError,type ArchiveManifest}from'../contract.ts';
import{archiveSha256,archiveUtf8}from'../package.ts';
import type{ArchiveSealedReadPort}from'../sealedRead.ts';
import{actor,id,org,packageInput}from'./fixtures.ts';
export async function sealedFixture(partial=false){
 const original=await packageInput();const manifest:ArchiveManifest=JSON.parse(new TextDecoder().decode(original.manifest_bytes));if(partial){manifest.completeness='partial';manifest.blockers=['PACKAGE_INCOMPLETE'];}
 const bytes=archiveUtf8(manifest),hash=await archiveSha256(bytes);const input={...original,manifest_bytes:bytes,manifest_sha256:hash};
 const context={version:1,organization_id:org,scope:{kind:'organization'}as const,actor_id:actor,package:{id:manifest.package_id,case_id:manifest.case_id,organization_id:org,input_revision:manifest.case_revision,input_state_hash:manifest.case_state_hash,phase:'sealed',manifest_sha256:hash,manifest_bytes:bytes.byteLength,completeness:manifest.completeness,blockers:manifest.blockers,created_at:manifest.created_at,sealed_at:manifest.created_at},manifest_json:new TextDecoder().decode(bytes)};
 const fileContexts=manifest.files.map((file,index)=>({version:1,organization_id:org,scope:{kind:'organization'}as const,actor_id:actor,package_id:manifest.package_id,manifest_sha256:hash,file_id:file.id,bucket:'archive-case-artifacts'as const,path:org+'/'+manifest.package_id+'/files/'+file.id+'/'+file.byte_sha256+'.bin',object_id:id(910+index),object_updated_at:'2026-10-23T01:02:03.123456Z',byte_sha256:file.byte_sha256,byte_size:file.byte_size,mime_type:file.mime_type}));
 let current=true;const port:ArchiveSealedReadPort={observedActorId:actor,organizationId:org,scope:{kind:'organization'},packageId:manifest.package_id,assertCurrent(){if(!current)throw new ArchiveError('ACCESS_DENIED');},manifestContext:vi.fn(async()=>structuredClone(context)),fileContext:vi.fn(async fileId=>structuredClone(fileContexts.find(row=>row.file_id===fileId))),downloadExact:vi.fn(async row=>input.files.get(manifest.files.find(file=>file.id===row.file_id)!.archive_path)!.slice())};
 return{input,manifest,context,fileContexts,port,revoke:()=>{current=false;}};
}
