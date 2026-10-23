// UC022 V2B3 private technical proof. No legacy/signature event or legal-method upgrade.
import { z } from 'npm:zod@3.25.76';
export const SIGNATURE_SOURCE_MAX_BYTES=20*1024*1024;
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const utc=z.string().max(64).datetime({offset:false});
const party=z.enum(['sender','recipient']);
const path=z.string().min(1).max(2000).refine(v=>!/[\x00-\x20\x7f%?#\\]/.test(v)&&!v.split('/').some(p=>!p||p==='.'||p==='..'));
const bucket=z.enum(['external-contracts','signed-documents']);
const mime=z.string().min(3).max(200).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/);
const size=z.number().int().min(1).max(SIGNATURE_SOURCE_MAX_BYTES);
export const signatureVerificationAddressSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('invitation'),token:z.string().min(16).max(200).regex(/^[^\s\x00-\x1f\x7f]+$/)}).strict(),
 z.object({kind:z.literal('authenticated_signature'),organization_id:uuid,signature_id:uuid,chosen_party:party}).strict(),
]);
const authenticatedAddress=z.object({kind:z.literal('authenticated_signature'),organization_id:uuid,signature_id:uuid,chosen_party:party}).strict();
const selector={expected_document_revision_id:uuid.nullable(),document_html_sha256:sha};
export const signatureSourceVerificationRequestSchema=z.object({version:z.literal(1),action:z.literal('verify_source'),verification_request_id:uuid,address:authenticatedAddress,...selector}).strict();
export const signatureStorageObjectSnapshotSchema=z.object({object_id:uuid,bucket,path,updated_at:utc,metadata_sha256:sha,reported_size:size.nullable(),reported_mime:mime.nullable()}).strict();
export const signatureFileTupleSchema=z.object({organization_id:uuid,signature_id:uuid,chosen_party:party,document_revision_id:uuid.nullable(),document_html_sha256:sha,purpose:z.enum(['source','scan']),bucket,path}).strict();
export const signatureExactFileSchema=z.object({bucket,path,sha256:sha,bytes:size,mime}).strict();
export const trustedSignatureFileProofSchema=z.object({assurance:z.literal('trusted_service_reread'),source:signatureFileTupleSchema,object_before:signatureStorageObjectSnapshotSchema,file:signatureExactFileSchema,object_after:signatureStorageObjectSnapshotSchema}).strict().superRefine((v,c)=>{
 const fail=(message:string)=>c.addIssue({code:'custom',message});
 if(v.source.bucket!==v.file.bucket||v.source.path!==v.file.path)fail('Wrong source file');
 for(const o of [v.object_before,v.object_after]){
  if(o.bucket!==v.source.bucket||o.path!==v.source.path)fail('Wrong object file');
  if(o.reported_size!==null&&o.reported_size!==v.file.bytes)fail('Wrong reported byte size');
  if(o.reported_mime!==null&&o.reported_mime!==v.file.mime)fail('Wrong reported MIME');
 }
 if(JSON.stringify(v.object_before)!==JSON.stringify(v.object_after))fail('Changed object identity/metadata');
});
const contextAction=z.object({action:z.literal('file_context'),address:signatureVerificationAddressSchema,...selector,purpose:z.enum(['source','scan']),scan_path:path.nullable()}).strict();
const attestAction=z.object({action:z.literal('attest_file'),address:signatureVerificationAddressSchema,...selector,purpose:z.enum(['source','scan']),scan_path:path.nullable(),verification_request_id:uuid}).strict();
export const signatureFileActionSchema=z.union([contextAction,attestAction]).superRefine((v,c)=>{
 if((v.purpose==='scan')!==(v.scan_path!==null))c.addIssue({code:'custom',message:'Wrong scan selector'});
});
export const signatureFileContextSchema=z.object({version:z.literal(1),ok:z.literal(true),kind:z.literal('file_context'),source:signatureFileTupleSchema,object:signatureStorageObjectSnapshotSchema}).strict().superRefine((v,c)=>{
 if(v.source.bucket!==v.object.bucket||v.source.path!==v.object.path)c.addIssue({code:'custom',message:'Wrong canonical object'});
});
export const signatureFileVerificationReceiptSchema=z.object({version:z.literal(1),ok:z.literal(true),kind:z.literal('file_verified'),verification_request_id:uuid,verification_record_id:uuid,outcome:z.enum(['applied','replayed']),verified_at:utc,source:signatureFileTupleSchema,object:signatureStorageObjectSnapshotSchema,file:signatureExactFileSchema}).strict().superRefine((v,c)=>{
 if(v.source.bucket!==v.file.bucket||v.source.path!==v.file.path||v.object.bucket!==v.file.bucket||v.object.path!==v.file.path||v.object.reported_size!==null&&v.object.reported_size!==v.file.bytes||v.object.reported_mime!==null&&v.object.reported_mime!==v.file.mime)c.addIssue({code:'custom',message:'Wrong verified file tuple'});
});
export const signatureSourceVerificationResultSchema=z.object({version:z.literal(1),ok:z.literal(true),kind:z.literal('source_verified'),verification_request_id:uuid,verification_record_id:uuid,outcome:z.enum(['applied','replayed']),verified_at:utc,organization_id:uuid,signature_id:uuid,chosen_party:party,document_revision_id:uuid.nullable(),document_html_sha256:sha,byte_sha256:sha,byte_size:size}).strict();
export type SignatureSourceVerificationRequest=z.infer<typeof signatureSourceVerificationRequestSchema>;
export type SignatureFileTuple=z.infer<typeof signatureFileTupleSchema>;
export type SignatureStorageObjectSnapshot=z.infer<typeof signatureStorageObjectSnapshotSchema>;
export type SignatureFileAction=z.infer<typeof signatureFileActionSchema>;
export type TrustedSignatureFileProof=z.infer<typeof trustedSignatureFileProofSchema>;
export type SignatureFileContext=z.infer<typeof signatureFileContextSchema>;
export type SignatureFileVerificationReceipt=z.infer<typeof signatureFileVerificationReceiptSchema>;
export type SignatureSourceVerificationResult=z.infer<typeof signatureSourceVerificationResultSchema>;
