import {z}from'zod';
import {issuanceArtifactFinalRefSchema}from'../educationIssuance/contract';
import {hash,utc,uuid}from'./contract';
import {sameEvidenceValue,SignatureEvidenceError}from'./validation';
const count=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const rawPath=z.string().max(2000).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/versions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/);
/** Separate K622 descriptor. This does not widen legacy ExactFile bucket permissions.
 * Only the owner-private SQL bridge may resolve this descriptor under actual current
 * signature, learner, issued-record and immutable-version authority. */
export const issuedSignatureSource=z.object({version:z.literal(1),kind:z.literal('controlled_education_artifact'),organization_id:uuid,signature_id:uuid,
 record_id:uuid,record_revision:count,record_state_sha256:hash,subject_user_id:uuid,enrollment_id:uuid,group_id:uuid.nullable(),
 artifact:issuanceArtifactFinalRefSchema,object:z.object({id:uuid,updated_at:utc}).strict(),
 file:z.object({bucket:z.literal('org-documents'),path:rawPath,sha256:hash,bytes:z.number().int().min(1).max(20971520),mime:z.literal('application/pdf')}).strict(),
 byte_assurance:z.literal('trusted_issuance_attestation'),current_byte_reread:z.literal(false),cryptographic_signature_verification:z.literal('not_performed')}).strict().superRefine((value,ctx)=>{
 const parts=value.file.path.split('/');
 if(parts[0]!==value.organization_id||parts[2]!==value.artifact.source.document_id||value.file.sha256!==value.artifact.byte_sha256||value.file.bytes!==value.artifact.byte_size)ctx.addIssue({code:'custom',message:'Wrong issued PDF source or actual byte domain'});
});
export type IssuedSignatureSource=z.infer<typeof issuedSignatureSource>;
export const issuedSignatureSourceScope=z.object({organization_id:uuid,signature_id:uuid,record_id:uuid,record_revision:count,
 record_state_sha256:hash,subject_user_id:uuid,enrollment_id:uuid,group_id:uuid.nullable(),artifact:issuanceArtifactFinalRefSchema}).strict();
export type IssuedSignatureSourceScope=z.infer<typeof issuedSignatureSourceScope>;
/** Validate a current authorized server projection; this pure check is not an
 * authorization decision or a fresh download/hash of the underlying PDF bytes. */
export function verifyIssuedSignatureSource(input:unknown,expected:IssuedSignatureSourceScope,current:()=>boolean):IssuedSignatureSource{
 if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
 const scope=issuedSignatureSourceScope.safeParse(structuredClone(expected)),parsed=issuedSignatureSource.safeParse(structuredClone(input));
 if(!scope.success||!parsed.success)throw new SignatureEvidenceError('INVALID_INPUT');
 const value=parsed.data;
 for(const key of ['organization_id','signature_id','record_id','record_revision','record_state_sha256','subject_user_id','enrollment_id','group_id','artifact']as const){
  if(!sameEvidenceValue(value[key],scope.data[key]))throw new SignatureEvidenceError('SOURCE_CHANGED');
 }
 if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
 return value;
}
