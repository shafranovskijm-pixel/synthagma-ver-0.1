// Canonical UC019 worker handshake V6. No business issuance or allocator call is allowed here.
import { z } from 'npm:zod@3.25.76';
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const positive=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const stamp=z.string().max(64).datetime({offset:true});
const bounded=(n:number)=>z.string().max(n);
const nonempty=(n:number)=>bounded(n).refine(v=>v.trim().length>0);
const scope=z.discriminatedUnion('kind',[z.object({kind:z.literal('organization')}).strict(),z.object({kind:z.literal('group'),group_id:uuid}).strict()]);
const source=z.object({kind:z.literal('org_document_version'),document_id:uuid,version_id:uuid,content_hash:hash}).strict();
const templateRef=z.object({source,review_id:uuid,review_revision:positive}).strict();
const identity=z.object({object_id:uuid,updated_at:stamp}).strict();
const size=z.number().int().min(1).max(20971520);
const renderer={renderer:z.literal('browserless'),renderer_revision:z.literal('uc019-v1')};
const requestFields={organization_id:uuid,preparation_id:uuid,item_id:uuid,input_revision:positive,request_id:uuid};
export const educationArtifactRequestSchema=z.object(requestFields).strict();
export const educationArtifactSourceSchema=z.object({bucket:z.literal('org-documents'),path:nonempty(1000),object_id:uuid,updated_at:stamp,byte_size:z.number().int().min(1).max(1048576),mime_type:z.literal('text/html'),metadata_hash:hash,known_sha256:hash.nullable()}).strict();
export const educationRenderVariablesSchema=z.object({organization_name:nonempty(1000),organization_inn:bounded(20),organization_ogrn:bounded(20),organization_director_name:bounded(500),organization_director_position:bounded(300),organization_director_authority:bounded(1000),full_name:nonempty(500),birth_date:nonempty(10),document_type_label:nonempty(100),document_series:bounded(120),document_number:nonempty(120),reg_number:nonempty(120),issue_date:nonempty(10),program_title:nonempty(4000),program_type_label:nonempty(200),academic_hours:nonempty(40),qualification_name:bounded(4000),profession:bounded(4000),attestation_outcome:nonempty(100),attestation_recorded_date:nonempty(10)}).strict();
export const educationStagingProofSchema=z.object({object_id:uuid,updated_at:stamp,byte_sha256:hash,byte_size:size,template_byte_sha256:hash,html_sha256:hash,...renderer}).strict();
const preparedArtifact=z.object({source,byte_sha256:hash,byte_size:size,render_input_hash:hash,template_byte_sha256:hash,html_sha256:hash,...renderer,output_review:z.object({id:uuid,revision:positive}).strict().nullable()}).strict();
export const educationArtifactContextSchema=z.object({schema_version:z.literal(1),...requestFields,user_id:uuid,subject_user_id:uuid,scope,mode:z.enum(['prepared','staged','rendered','consumed']),final_record_id:uuid.nullable(),render_input_hash:hash,template:z.object({ref:templateRef,storage:educationArtifactSourceSchema}).strict(),variables:educationRenderVariablesSchema,staging:z.object({bucket:z.literal('education-issuance-staging'),path:nonempty(1000),proof:educationStagingProofSchema.nullable()}).strict(),output:z.object({document_id:uuid,upload_request_id:uuid,expected_revision:z.literal(0),file_path:nonempty(1000),file_name:nonempty(200),document:z.object({name:nonempty(1000),type:z.literal('other'),issue_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.literal('active')}).strict(),source:source.nullable(),object:identity.nullable(),artifact:preparedArtifact.nullable()}).strict()}).strict().superRefine((v,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});
 if((v.mode==='consumed')!==(v.final_record_id!==null))bad('Unconfirmed consumed record');
 if(v.staging.path!==[v.subject_user_id,v.organization_id,v.preparation_id,v.item_id,v.render_input_hash+'.pdf'].join('/'))bad('Unconfirmed subject staging path');
 if(v.output.file_path!==[v.organization_id,'versions',v.output.document_id,v.output.upload_request_id+'.pdf'].join('/'))bad('Unconfirmed canonical output path');
 if(!v.template.storage.path.startsWith(v.organization_id+'/versions/'+v.template.ref.source.document_id+'/'))bad('Unconfirmed template path');
 if((v.output.source===null)!==(v.output.object===null))bad('Unconfirmed output object source');
 if(v.output.source&&v.output.source.document_id!==v.output.document_id)bad('Unconfirmed output document');
 if(v.mode==='prepared'&&(v.staging.proof!==null||v.output.artifact!==null))bad('Prepared context cannot claim attestation');
 if(['staged','rendered','consumed'].includes(v.mode)&&v.staging.proof===null)bad('Missing staging proof');
 if(v.mode==='staged'&&v.output.artifact!==null)bad('Unconfirmed staged mode');
 if(['rendered','consumed'].includes(v.mode)&&(v.output.artifact===null||v.output.source===null||v.output.object===null))bad('Missing saved artifact');
 if(v.output.artifact){const a=v.output.artifact,s=v.staging.proof,o=v.output.source;
  if(!s||a.render_input_hash!==v.render_input_hash||a.byte_sha256!==s.byte_sha256||a.byte_size!==s.byte_size||a.template_byte_sha256!==s.template_byte_sha256||a.html_sha256!==s.html_sha256||!o||a.source.document_id!==o.document_id||a.source.version_id!==o.version_id||a.source.content_hash!==o.content_hash)bad('Unconfirmed saved winner bytes');
 }
});
export const educationStagingAttestProofSchema=z.object({render_input_hash:hash,template_source_hash:hash,template_object_id:uuid,template_updated_at:stamp,template_byte_sha256:hash,html_sha256:hash,staged_object_id:uuid,staged_updated_at:stamp,byte_sha256:hash,byte_size:size,mime_type:z.literal('application/pdf'),...renderer}).strict();
export const educationOutputAttestProofSchema=z.object({render_input_hash:hash,staged_object_id:uuid,staged_updated_at:stamp,source,output_object_id:uuid,output_updated_at:stamp,byte_sha256:hash,byte_size:size,mime_type:z.literal('application/pdf'),...renderer}).strict();
// Raw PostgreSQL metadata is an observation, never an artifact attestation.
const observedStorageObject=z.object({bucket:z.enum(['education-issuance-staging','org-documents']),path:nonempty(1000),object_id:uuid,
 updated_at:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/),byte_size:size,mime_type:z.literal('application/pdf'),
 storage_metadata:z.record(z.unknown()),user_metadata:z.record(z.unknown()).nullable()}).strict();
export const educationArtifactObjectObservationSchema=z.object({schema_version:z.literal(1),...requestFields,actor_id:uuid,
 render_input_hash:hash,kind:z.enum(['staging','output']),object:observedStorageObject.nullable()}).strict();
export const educationArtifactAttestationSchema=z.object({schema_version:z.literal(1),kind:z.enum(['staging_attested','artifact_attested']),organization_id:uuid,preparation_id:uuid,item_id:uuid,input_revision:positive,render_input_hash:hash,byte_sha256:hash,byte_size:size,object_id:uuid,updated_at:stamp}).strict();
export const educationArtifactWorkerResultSchema=z.object({schema_version:z.literal(1),...requestFields,status:z.enum(['rendered_unissued','consumed']),final_record_id:uuid.nullable(),artifact:preparedArtifact}).strict().refine(v=>(v.status==='consumed')===(v.final_record_id!==null),'Unconfirmed worker consumption');
export type EducationArtifactRequest=z.infer<typeof educationArtifactRequestSchema>;
export type EducationArtifactContext=z.infer<typeof educationArtifactContextSchema>;
export type EducationRenderVariables=z.infer<typeof educationRenderVariablesSchema>;
export type EducationStagingProof=z.infer<typeof educationStagingProofSchema>;
export type EducationArtifactWorkerResult=z.infer<typeof educationArtifactWorkerResultSchema>;
