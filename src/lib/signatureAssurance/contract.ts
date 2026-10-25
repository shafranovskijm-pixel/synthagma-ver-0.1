import {z} from 'zod';
import {registrySourceSchema} from '../documentRegistry/contract.ts';
export {AUTHENTICATED_RPC_ABI, SERVICE_RPC_ABI, LIMITS} from './types.ts';

export const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const hash=z.string().regex(/^[0-9a-f]{64}$/);
export const revision=z.number().int().min(0).max(2147483647);
export const positiveRevision=revision.refine(value=>value>0);
export const utc=z.string().max(64).datetime().refine(value=>value.endsWith('Z'));
const controls=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const text=(max=4000)=>z.string().trim().min(1).max(max).refine(value=>!controls.test(value));
const literalText=(max:number)=>z.string().max(max).refine(value=>new TextEncoder().encode(value).length<=max);
const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;});
const unique=<T>(values:T[])=>new Set(values).size===values.length;
const ids=(max=100,min=0)=>z.array(uuid).min(min).max(max).refine(unique);
export const supportedMethod=z.enum(['graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation']);
export const unsupportedMethod=z.enum(['verified_email_challenge_confirmation','external_qualified_signature']);
export const method=z.enum(['graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation','verified_email_challenge_confirmation','external_qualified_signature','legacy_unknown']);
export const signingParty=z.enum(['sender','recipient']);
export const partyRole=z.enum(['sender','recipient','student','individual','company_representative']);
export const policyState=z.enum(['draft','source_checked','reviewed','centre_accepted','retired']);
export const conclusion=z.enum(['not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown']);
export const errorCode=z.enum(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','CLASSIFICATION_REQUIRED','POLICY_REQUIRED','POLICY_NOT_ACCEPTED','POLICY_CHANGED','IDENTITY_REQUIRED','IDENTITY_MISMATCH','AUTHORITY_REQUIRED','AGREEMENT_REQUIRED','AGREEMENT_CHANGED','METHOD_UNSUPPORTED','SOURCE_UNAVAILABLE','SOURCE_CHANGED','CLOSED','EXPIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE']);
export const failure=z.object({version:z.literal(1),ok:z.literal(false),code:errorCode}).strict();
export const exactFile=z.object({bucket:z.enum(['external-contracts','signed-documents','org-documents']),path:text(2000).refine(value=>!/[?#\\\x00-\x1f]/.test(value)&&!value.includes('://')&&!value.split('/').some(part=>part==='.'||part==='..')),
  sha256:hash,bytes:z.number().int().positive().max(20971520),mime:text(200)}).strict();
export const serviceVerifiedBytes=z.object({assurance:z.literal('trusted_service_reread'),byte_sha256:hash,byte_size:z.number().int().positive().max(20971520),object_id:uuid,updated_at:utc,verification_record_id:uuid}).strict();
const orgSelection=z.object({kind:z.literal('org_document_version'),organization_id:uuid,source:registrySourceSchema}).strict();
const registrySelection=z.object({kind:z.literal('document_registry_file'),organization_id:uuid,registry_record_id:uuid,registry_record_revision:positiveRevision,source:registrySourceSchema}).strict();
/** Input has no byte_proof/verification/visibility field: only an exact current selection. */
export const exactDocumentSelection=z.discriminatedUnion('kind',[orgSelection,registrySelection]);
export const exactDocumentReference=z.discriminatedUnion('kind',[orgSelection.extend({byte_proof:serviceVerifiedBytes.nullable()}).strict(),registrySelection.extend({byte_proof:serviceVerifiedBytes.nullable()}).strict()]);
export function disclosure<T extends z.ZodTypeAny>(value:T){return z.discriminatedUnion('visibility',[
  z.object({visibility:z.literal('available'),captured_reference_sha256:hash,captured_reference_json:literalText(196608),value}).strict(),
  z.object({visibility:z.literal('redacted'),captured_reference_sha256:hash,value:z.null(),reason:z.literal('current_file_scope')}).strict(),
]);}
export const fileDisclosure=disclosure(exactFile),authorityDisclosure=disclosure(exactDocumentReference),policyDisclosure=disclosure(exactDocumentSelection);
export const disclosureSummary=z.object({kind:z.enum(['complete','current_scope_projection']),redacted_reference_count:revision,redacted_content_count:revision,complete_private_evidence_verified:z.boolean()}).strict().superRefine((value,ctx)=>{
  const masked=value.redacted_reference_count+value.redacted_content_count>0;
  if(masked!==(value.kind==='current_scope_projection')||masked&&value.complete_private_evidence_verified)ctx.addIssue({code:'custom',message:'Unconfirmed disclosure completeness'});
});
export const classification=z.object({document_type:z.enum(['contract','consent','act','order','custom_pdf','education_document','external_upload']),subtype:text(120).refine(value=>value!=='*'),party_role:partyRole}).strict();
export const legalSourceReference=z.object({source_key:text(120),title:text(500),primary_url:text(2000).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!/[\x00-\x20]/.test(value);}catch{return false;}}),provision:text(2000),edition:text(500),checked_on:calendarDate,effective_from:calendarDate.nullable(),effective_until:calendarDate.nullable(),completeness:z.enum(['verified_body','consolidation_review_required']),limitation:text().nullable()}).strict().refine(value=>value.completeness!=='consolidation_review_required'||value.limitation!==null);
export const canonicalTerms=z.object({kind:z.enum(['pep_agreement','personal_data_consent']),version:text(120),text:literalText(65536).refine(value=>value.trim().length>0),sha256:hash}).strict();
const identityRequirement=z.enum(['declared','account_control']),authorityRequirement=z.enum(['self','declared_representative','exact_document_reference']);
const basisFields={kind:z.enum(['law','agreement','local_act','combined']),explanation:text(),sources:z.array(legalSourceReference).max(20)};
const policyFields={version:z.literal(1),classification,method:supportedMethod,purpose:z.enum(['factual_only','account_pep','paper_scan_record']),identity_requirement:identityRequirement,authority_requirement:authorityRequirement,
  agreement:canonicalTerms.nullable(),consent:canonicalTerms.nullable(),limitations:text()};
function checkPolicy(value:{method?:z.infer<typeof supportedMethod>;purpose?:string;identity_requirement?:string;agreement?:z.infer<typeof canonicalTerms>|null;consent?:z.infer<typeof canonicalTerms>|null;classification?:z.infer<typeof classification>},ctx:z.RefinementCtx){
  const invalid=value.method==='graphic_asset'&&value.purpose!=='factual_only'
    ||value.method==='bearer_invitation_confirmation'&&(value.purpose!=='factual_only'||value.identity_requirement!=='declared')
    ||value.method==='scan_received'&&value.purpose!=='paper_scan_record'
    ||value.purpose==='account_pep'&&(value.method!=='authenticated_account_confirmation'||value.identity_requirement!=='account_control'||value.agreement?.kind!=='pep_agreement')
    ||value.method==='authenticated_account_confirmation'&&value.classification.document_type==='consent'&&value.consent?.kind!=='personal_data_consent'
    ||value.agreement!==null&&value.agreement.kind!=='pep_agreement'||value.consent!==null&&value.consent.kind!=='personal_data_consent';
  if(invalid)ctx.addIssue({code:'custom',message:'Method and purpose cannot claim unsupported assurance'});
}
export const policyBody=z.object({...policyFields,basis:z.object({...basisFields,document_references:z.array(exactDocumentSelection).max(20)}).strict()}).strict().superRefine(checkPolicy);
export const policyBodyProjection=z.object({...policyFields,basis:z.object({...basisFields,document_references:z.array(policyDisclosure).max(20)}).strict()}).strict().superRefine(checkPolicy);
export const actorFact=z.object({user_id:uuid.nullable(),observed_mode:z.enum(['account','bearer','legacy_unknown']),observed_email:z.string().max(320).nullable(),email_control_confirmed:z.boolean(),declared_full_name:text(300).nullable(),name_assurance:z.enum(['declared','legacy_unknown'])}).strict().superRefine((value,ctx)=>{
  if(value.observed_mode==='account'&&value.user_id===null||value.email_control_confirmed&&(value.observed_mode!=='account'||value.observed_email===null||!z.string().email().safeParse(value.observed_email).success))ctx.addIssue({code:'custom',message:'Unconfirmed account/email observation'});
});
export const authorityInput=z.object({kind:z.enum(['self','declared_representative','exact_document_reference','unknown']),declaration:text().nullable(),document_reference:exactDocumentSelection.nullable()}).strict().superRefine((value,ctx)=>{
  if((value.kind==='exact_document_reference')!==(value.document_reference!==null)||value.kind==='declared_representative'&&value.declaration===null)ctx.addIssue({code:'custom',message:'Unconfirmed authority input'});
});
export const authorityFact=z.object({kind:z.enum(['self','declared_representative','exact_document_reference','unknown']),declaration:text().nullable(),document_reference:authorityDisclosure.nullable(),verification:z.enum(['not_verified','exact_reference_checked'])}).strict().superRefine((value,ctx)=>{
  if((value.kind==='exact_document_reference')!==(value.document_reference!==null)||value.verification==='exact_reference_checked'&&value.kind!=='exact_document_reference'||value.kind==='declared_representative'&&value.declaration===null)ctx.addIssue({code:'custom',message:'Unconfirmed authority evidence'});
});
export const policyDecision=z.object({id:uuid,revision:positiveRevision,state:policyState,server_at:utc,actor_user_id:uuid.nullable(),reason:text(),authority:authorityFact,source_limits_acknowledged:z.boolean()}).strict();
export const policyVersion=z.object({id:uuid,family_id:uuid,organization_id:uuid,version:positiveRevision,body:policyBodyProjection,body_sha256:hash,body_json:literalText(196608).nullable(),projection_json:literalText(196608),projection_sha256:hash,disclosure:disclosureSummary,created_at:utc,created_by:uuid.nullable(),decision:policyDecision,decision_history:z.array(policyDecision).min(1).max(5000).optional()}).strict();
export const policyChoice=z.object({id:uuid,family_id:uuid,organization_id:uuid,version:positiveRevision,body_sha256:hash,classification,method:supportedMethod,purpose:policyFields.purpose,identity_requirement:identityRequirement,authority_requirement:authorityRequirement,limitations:text(),decision_revision:positiveRevision}).strict();
export const capabilities=z.object({can_read:z.boolean(),can_draft_policy:z.boolean(),can_review_policy:z.boolean(),can_accept_policy:z.boolean(),can_bind_signature:z.boolean(),can_confirm_account:z.boolean(),can_confirm_sender:z.boolean(),can_receive_scan:z.boolean(),can_record_bearer_fact:z.boolean(),can_capture_receipt:z.boolean(),supported_methods:z.array(supportedMethod).length(4).refine(unique),unsupported_methods:z.array(z.object({method:unsupportedMethod,verified:z.literal(false),reason:z.literal('VERIFIER_NOT_IMPLEMENTED')}).strict()).length(2).refine(values=>unique(values.map(value=>value.method)))}).strict();
const evidenceError=errorCode.exclude(['INVALID_INPUT','NOT_FOUND','REQUEST_CONFLICT','DEPENDENCY_UNAVAILABLE']);
export const evidenceRequirements=z.object({eligible:z.boolean(),missing:z.array(evidenceError).max(30).refine(unique),purpose:z.enum(['factual_only','account_pep','paper_scan_record','unconfigured']),limitations:z.array(text()).max(30)}).strict().refine(value=>value.eligible===!value.missing.length);
export const binding=z.object({id:uuid,organization_id:uuid,signature_id:uuid,party_role:signingParty,revision:positiveRevision,document_snapshot_id:uuid,document_revision_id:uuid.nullable(),document_html_sha256:hash,original_file:fileDisclosure.nullable(),classification,policy_version_id:uuid,policy_sha256:hash,policy_decision_revision:positiveRevision,agreement_sha256:hash.nullable(),subject_user_id:uuid.nullable(),recipient_user_id:uuid.nullable(),bound_at:utc,bound_by:uuid.nullable()}).strict().refine(value=>(value.party_role==='sender')===(value.classification.party_role==='sender'));
export const signaturePartyContext=z.object({party_role:signingParty,binding:binding.nullable(),policy:policyVersion.nullable(),latest_party_event_revision:revision,conclusion,requirements:evidenceRequirements}).strict().superRefine((value,ctx)=>{
  if((value.binding===null)!==(value.policy===null)||value.binding&&(value.binding.party_role!==value.party_role||value.binding.policy_version_id!==value.policy?.id||value.binding.policy_sha256!==value.policy?.body_sha256||value.binding.revision>value.latest_party_event_revision))ctx.addIssue({code:'custom',message:'Unconfirmed party binding'});
});
export const signatureContext=z.object({organization_id:uuid,signature_id:uuid,current_document_revision_id:uuid.nullable(),current_document_html_sha256:hash,legacy_status:text(100),legacy_method:text(100).nullable(),chosen_party:signingParty,parties:z.object({sender:signaturePartyContext,recipient:signaturePartyContext}).strict(),latest_event_revision:revision,capabilities,latest_receipt_id:uuid.nullable(),legacy_evidence_available:z.boolean()}).strict().superRefine((value,ctx)=>{
  for(const role of ['sender','recipient']as const){const party=value.parties[role];if(party.party_role!==role||party.latest_party_event_revision>value.latest_event_revision||party.binding&&(party.binding.organization_id!==value.organization_id||party.binding.signature_id!==value.signature_id)||party.policy&&party.policy.organization_id!==value.organization_id)ctx.addIssue({code:'custom',message:'Wrong signature party scope'});if(party.latest_party_event_revision===0&&party.conclusion!=='not_confirmed'&&!(party.conclusion==='legacy_unknown'&&value.legacy_evidence_available))ctx.addIssue({code:'custom',message:'Missing recorded party event'});}
  if(value.capabilities.can_confirm_account&&value.chosen_party!=='recipient'||value.capabilities.can_confirm_sender&&value.chosen_party!=='sender')ctx.addIssue({code:'custom',message:'Wrong confirmation party'});
});
export const documentSnapshot=z.object({id:uuid,organization_id:uuid,signature_id:uuid,party_role:signingParty,document_revision_id:uuid.nullable(),html_text:literalText(1000000).nullable(),html_sha256:hash,original_file:fileDisclosure.nullable(),content_visibility:z.enum(['available','redacted_current_file_scope','redacted_credential_bearing_source']),source_file_state:z.enum(['not_present','verified_bytes','unverified_reference']),captured_at:utc}).strict().refine(value=>(value.content_visibility==='available')===(value.html_text!==null));
export const consentSnapshot=z.object({id:uuid,legacy_consent_id:uuid.nullable(),organization_id:uuid,subject_user_id:uuid,revision,state:z.enum(['confirmed','withdrawn','legacy_unknown']),consent_terms:canonicalTerms.nullable(),rendered_text:literalText(65536).nullable(),rendered_text_sha256:hash.nullable(),organization_name:text(500).nullable(),organization_inn:text(20).nullable(),actor:actorFact,policy_version_id:uuid.nullable(),policy_sha256:hash.nullable(),agreement_event_id:uuid.nullable(),confirmed_at:utc.nullable(),withdrawn_at:utc.nullable(),legacy_recorded_at:utc.nullable(),limitations:z.array(text()).max(30)}).strict().superRefine((value,ctx)=>{
  const legacy=value.state==='legacy_unknown';
  if((value.rendered_text===null)!==(value.rendered_text_sha256===null)
    ||legacy&&(value.revision!==0||value.legacy_consent_id!==value.id||value.confirmed_at!==null||value.withdrawn_at!==null||value.policy_version_id!==null||value.policy_sha256!==null||value.agreement_event_id!==null||value.consent_terms!==null||value.rendered_text!==null||value.actor.observed_mode!=='legacy_unknown'||value.actor.email_control_confirmed)
    ||!legacy&&(value.revision===0||value.legacy_consent_id!==null||!value.consent_terms||value.consent_terms.kind!=='personal_data_consent'||!value.confirmed_at||!value.policy_version_id||!value.policy_sha256||!value.agreement_event_id||!value.rendered_text||value.actor.observed_mode!=='account'||value.actor.user_id!==value.subject_user_id)
    ||value.state==='withdrawn'&&value.withdrawn_at===null||value.state==='confirmed'&&value.withdrawn_at!==null)ctx.addIssue({code:'custom',message:'Unconfirmed consent provenance'});
});
export const accountAgreement=z.object({kind:z.literal('account_acceptance'),id:uuid,legacy_agreement_id:z.null(),organization_id:uuid,subject_user_id:uuid,terms:canonicalTerms,rendered_text:literalText(65536),rendered_text_sha256:hash,actor:actorFact,policy_version_id:uuid,policy_sha256:hash,accepted_at:utc,timestamp_assurance:z.literal('platform_server_time'),identity_assurance:z.literal('observed_account_control'),assurance:z.literal('account_acceptance')}).strict().refine(value=>value.actor.observed_mode==='account'&&value.actor.user_id===value.subject_user_id&&value.terms.kind==='pep_agreement');
export const legacyAgreement=z.object({kind:z.literal('legacy_unknown'),id:uuid,legacy_agreement_id:uuid,organization_id:uuid.nullable(),subject_user_id:uuid,organization_assurance:z.enum(['stored_exact','association_unknown']),stored_terms:z.object({version:text(120).nullable(),text:literalText(65536).nullable(),text_sha256:hash.nullable(),hash_assurance:z.enum(['computed_from_known_stored_text','not_available'])}).strict(),stored_rendered_text:literalText(65536).nullable(),stored_rendered_text_sha256:hash.nullable(),actor:actorFact,policy_version_id:z.null(),policy_sha256:z.null(),accepted_at:z.null(),stored_timestamp:literalText(64).nullable(),timestamp_assurance:z.enum(['legacy_client_timestamp','legacy_origin_unknown']),identity_assurance:z.literal('unverified'),assurance:z.literal('legacy_unknown'),limitations:z.array(text()).min(1).max(30)}).strict().superRefine((value,ctx)=>{
  if((value.organization_id===null)!==(value.organization_assurance==='association_unknown')||(value.stored_terms.text===null)!==(value.stored_terms.text_sha256===null)||(value.stored_terms.text!==null)!==(value.stored_terms.hash_assurance==='computed_from_known_stored_text')||(value.stored_rendered_text===null)!==(value.stored_rendered_text_sha256===null)||value.actor.observed_mode!=='legacy_unknown'||value.actor.email_control_confirmed||value.actor.user_id!==value.subject_user_id||value.actor.name_assurance!=='legacy_unknown')ctx.addIssue({code:'custom',message:'Legacy unknown cannot acquire inferred provenance'});
});
export const agreementSnapshot=z.union([accountAgreement,legacyAgreement]);
export const streamKind=z.enum(['policy','signature','consent','agreement']);
export const eventKind=z.enum(['policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected']);
export const event=z.object({id:uuid,organization_id:uuid,stream_kind:streamKind,stream_id:uuid,revision:positiveRevision,kind:eventKind,server_at:utc,actor:actorFact,authority:authorityFact,method,policy_version_id:uuid.nullable(),policy_sha256:hash.nullable(),signature_id:uuid.nullable(),binding_id:uuid.nullable(),party_role:signingParty.nullable(),document_snapshot_id:uuid.nullable(),document_revision_id:uuid.nullable(),document_html_sha256:hash.nullable(),original_file:fileDisclosure.nullable(),scan_file:fileDisclosure.nullable(),agreement_event_id:uuid.nullable(),agreement_sha256:hash.nullable(),consent_snapshot_id:uuid.nullable(),conclusion,explanation:text(),request_id:uuid,cryptographic_verification:z.literal('not_performed'),time_assurance:z.literal('platform_server_time')}).strict().superRefine((value,ctx)=>{
  const signatureEvent=value.stream_kind==='signature';
  if(signatureEvent?(value.signature_id!==value.stream_id||value.party_role===null):(value.signature_id!==null||value.party_role!==null||value.binding_id!==null))ctx.addIssue({code:'custom',message:'Unconfirmed event party'});
  if(signatureEvent&&((value.binding_id===null)!==(value.policy_version_id===null))||(value.policy_version_id===null)!==(value.policy_sha256===null)||(value.agreement_event_id===null)!==(value.agreement_sha256===null))ctx.addIssue({code:'custom',message:'Unconfirmed policy binding'});
  const expectedStream=value.kind.startsWith('policy_')?'policy':value.kind==='agreement_accepted'?'agreement':value.kind.startsWith('consent_')?'consent':'signature';
  if(value.stream_kind!==expectedStream)ctx.addIssue({code:'custom',message:'Wrong event stream'});
  if(['signature_bound','account_confirmed','sender_confirmed'].includes(value.kind)&&(!value.binding_id||!value.policy_version_id||!value.policy_sha256||!value.document_snapshot_id))ctx.addIssue({code:'custom',message:'Missing exact binding'});
  if(value.kind==='sender_confirmed'&&value.party_role!=='sender'||['account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'].includes(value.kind)&&value.party_role!=='recipient')ctx.addIssue({code:'custom',message:'Wrong event party'});
  if(['account_confirmed','sender_confirmed'].includes(value.kind)&&value.method!=='authenticated_account_confirmation'||value.kind==='bearer_confirmed'&&value.method!=='bearer_invitation_confirmation'||value.kind==='scan_received'&&(value.method!=='scan_received'||!value.scan_file))ctx.addIssue({code:'custom',message:'Unconfirmed method'});
  if(value.conclusion==='policy_eligible_account_confirmation'&&(!['account_confirmed','sender_confirmed'].includes(value.kind)||!value.agreement_event_id||value.actor.observed_mode!=='account'||!value.actor.user_id))ctx.addIssue({code:'custom',message:'Unconfirmed account-policy evidence'});
});
export const eventPage=z.object({stream_kind:streamKind,stream_id:uuid,through_revision:revision,events:z.array(event).max(100),after_revision:revision,next_after_revision:positiveRevision.nullable()}).strict();
export const frozenManifestBody=z.object({schema_version:z.literal(1),id:uuid,organization_id:uuid,signature_id:uuid,captured_at:utc,captured_by:uuid.nullable(),manifest_kind:z.literal('scoped_derivative'),source_manifest_id:uuid,source_manifest_sha256:hash,disclosure:disclosureSummary,context:signatureContext,through_revision:revision,event_count:revision,events:z.array(event).max(5000),referenced_bindings:z.array(binding).max(5000),referenced_policies:z.array(policyVersion).max(5000),referenced_agreements:z.array(accountAgreement).max(5000),document_snapshots:z.array(documentSnapshot).max(5000),limitations:z.array(text()).max(100)}).strict();
export const frozenManifest=z.object({body:frozenManifestBody,body_json:literalText(2000000),body_json_sha256:hash,receipt_html:literalText(2000000),receipt_html_sha256:hash}).strict();
const applyShape={
  save_policy_draft:z.object({action:z.literal('save_policy_draft'),family_id:uuid.nullable(),previous_version_id:uuid.nullable(),body:policyBody}).strict(),
  record_policy_decision:z.object({action:z.literal('record_policy_decision'),policy_version_id:uuid,decision:z.enum(['source_checked','reviewed','centre_accepted','retired']),reason:text(),authority:authorityInput,source_limits_acknowledged:z.boolean()}).strict(),
  bind_signature:z.object({action:z.literal('bind_signature'),signature_id:uuid,party_role:signingParty,document_revision_id:uuid.nullable(),document_html_sha256:hash,classification,policy_version_id:uuid}).strict(),
  accept_agreement:z.object({action:z.literal('accept_agreement'),policy_version_id:uuid,terms_sha256:hash,rendered_text_sha256:hash,declared_full_name:text(300)}).strict(),
  confirm_consent:z.object({action:z.literal('confirm_consent'),policy_version_id:uuid,terms_sha256:hash,rendered_text_sha256:hash,declared_full_name:text(300),agreement_event_id:uuid,authority:authorityInput}).strict(),
  withdraw_consent:z.object({action:z.literal('withdraw_consent'),consent_snapshot_id:uuid,reason:text()}).strict(),
  confirm_sender:z.object({action:z.literal('confirm_sender'),signature_id:uuid,party_role:z.literal('sender'),binding_id:uuid,policy_sha256:hash,document_html_sha256:hash,declared_full_name:text(300),authority:authorityInput,agreement_event_id:uuid.nullable(),agreement_sha256:hash.nullable()}).strict(),
  record_graphic_preparation:z.object({action:z.literal('record_graphic_preparation'),signature_id:uuid,party_role:signingParty,binding_id:uuid.nullable(),document_html_sha256:hash,reason:text()}).strict(),
  revoke_invitation:z.object({action:z.literal('revoke_invitation'),signature_id:uuid,party_role:z.literal('recipient'),reason:text()}).strict(),
  capture_receipt:z.object({action:z.literal('capture_receipt'),signature_id:uuid,party_role:signingParty,through_revision:revision}).strict(),
};
export const applyAction=z.discriminatedUnion('action',[applyShape.save_policy_draft,applyShape.record_policy_decision,applyShape.bind_signature,applyShape.accept_agreement,applyShape.confirm_consent,applyShape.withdraw_consent,applyShape.confirm_sender,applyShape.record_graphic_preparation,applyShape.revoke_invitation,applyShape.capture_receipt]).superRefine((value,ctx)=>{
  if(value.action==='bind_signature'&&(value.party_role==='sender')!==(value.classification.party_role==='sender')||value.action==='confirm_sender'&&(value.agreement_event_id===null)!==(value.agreement_sha256===null))ctx.addIssue({code:'custom',message:'Wrong explicit party or agreement tuple'});
});
export const applyRequest=z.object({p_organization_id:uuid,p_request_id:uuid,p_expected_revision:revision,p_action:applyAction}).strict();
const page={after_id:uuid.nullable(),limit:z.number().int().min(1).max(100)};
export const readQuery=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('policy_list'),...page}).strict(),
  z.object({kind:z.literal('policy_choices'),signature_id:uuid.nullable(),party_role:signingParty.nullable(),purpose:z.enum(['signature','consent','agreement']),...page}).strict(),
  z.object({kind:z.literal('policy'),policy_version_id:uuid}).strict(),
  z.object({kind:z.literal('signature'),signature_id:uuid,party_role:signingParty}).strict(),
  z.object({kind:z.literal('events'),stream_kind:streamKind,stream_id:uuid,after_revision:revision,through_revision:revision.nullable(),limit:z.number().int().min(1).max(100)}).strict(),
  z.object({kind:z.literal('receipt'),signature_id:uuid,receipt_id:uuid}).strict(),
  z.object({kind:z.literal('subject'),subject_user_id:uuid,...page}).strict(),
  z.object({kind:z.literal('terms'),policy_version_id:uuid,terms_kind:z.enum(['pep_agreement','personal_data_consent']),declared_full_name:text(300)}).strict(),
]).superRefine((value,ctx)=>{if(value.kind==='policy_choices'&&(value.purpose==='signature'?(value.signature_id===null||value.party_role===null):(value.signature_id!==null||value.party_role!==null)))ctx.addIssue({code:'custom',message:'Wrong policy choice scope'});});
export const readRequest=z.object({p_organization_id:uuid,p_query:readQuery}).strict();
export const readResult=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('policy_list'),policies:z.array(policyVersion).max(100),next_after_id:uuid.nullable()}).strict(),
  z.object({kind:z.literal('policy_choices'),signature_id:uuid.nullable(),party_role:signingParty.nullable(),purpose:z.enum(['signature','consent','agreement']),choices:z.array(policyChoice).max(100),next_after_id:uuid.nullable()}).strict(),
  z.object({kind:z.literal('policy'),policy:policyVersion}).strict(),
  z.object({kind:z.literal('signature'),context:signatureContext}).strict(),
  z.object({kind:z.literal('events'),page:eventPage}).strict(),
  z.object({kind:z.literal('receipt'),manifest:frozenManifest}).strict(),
  z.object({kind:z.literal('subject'),subject_user_id:uuid,agreement_stream_id:uuid,agreement_revision:revision,consent_stream_id:uuid,consent_revision:revision,agreements:z.array(agreementSnapshot).max(100),consents:z.array(consentSnapshot).max(100),next_after_id:uuid.nullable()}).strict(),
  z.object({kind:z.literal('terms'),policy_version_id:uuid,subject_user_id:uuid,terms:canonicalTerms,rendered_text:literalText(65536),rendered_text_sha256:hash,declared_full_name:text(300)}).strict(),
]).superRefine((value,ctx)=>{if(value.kind==='policy_choices'&&(value.purpose==='signature'?(value.signature_id===null||value.party_role===null):(value.signature_id!==null||value.party_role!==null)))ctx.addIssue({code:'custom',message:'Wrong policy choice scope'});});
const confirmBase={token:text(200),party_role:z.literal('recipient'),request_id:uuid,expected_revision:revision,expected_document_revision_id:uuid.nullable(),document_html_sha256:hash,declared_full_name:text(300),authority:authorityInput,confirmed:z.literal(true)};
export const publicEdgeRequest=z.union([
  z.object({action:z.literal('context'),token:text(200),party_role:z.literal('recipient')}).strict(),
  z.object({action:z.literal('confirm'),...confirmBase,method:z.literal('bearer_invitation_confirmation'),binding_id:uuid.nullable(),policy_sha256:hash.nullable(),policy_decision_revision:positiveRevision.nullable()}).strict(),
  z.object({action:z.literal('confirm'),...confirmBase,method:z.literal('authenticated_account_confirmation'),binding_id:uuid,policy_sha256:hash,policy_decision_revision:positiveRevision,agreement_sha256:hash,agreement_event_id:uuid.nullable(),agreement_accepted:z.literal(true)}).strict(),
  z.object({action:z.literal('receive_scan'),token:text(200),party_role:z.literal('recipient'),request_id:uuid,expected_revision:revision,binding_id:uuid.nullable(),expected_document_revision_id:uuid.nullable(),document_html_sha256:hash,policy_sha256:hash.nullable(),policy_decision_revision:positiveRevision.nullable(),scan_path:text(2000),declared_full_name:text(300),declaration:text(),authority:authorityInput,confirmed:z.literal(true)}).strict(),
  z.object({action:z.literal('reject'),token:text(200),party_role:z.literal('recipient'),request_id:uuid,expected_revision:revision,expected_document_revision_id:uuid.nullable(),reason:text()}).strict(),
]);
export const serviceRequest=z.object({p_action:publicEdgeRequest,p_observed_actor_user_id:uuid.nullable(),p_request_ip:text(200).nullable(),p_request_user_agent:text(2000).nullable(),p_original_proof:exactFile.nullable(),p_scan_proof:exactFile.nullable()}).strict();
export const mutationReceipt=z.object({request_id:uuid,payload_sha256:hash,outcome:z.enum(['applied','replayed']),action:z.enum(['save_policy_draft','record_policy_decision','bind_signature','accept_agreement','confirm_consent','withdraw_consent','confirm_sender','record_graphic_preparation','revoke_invitation','capture_receipt','confirm','receive_scan','reject']),event_id:uuid.nullable(),party_role:signingParty.nullable(),binding_id:uuid.nullable(),entity_id:uuid,revision_applied:revision,server_at:utc}).strict().superRefine((value,ctx)=>{
  const signatureAction=['bind_signature','confirm_sender','record_graphic_preparation','revoke_invitation','capture_receipt','confirm','receive_scan','reject'].includes(value.action);
  if(signatureAction?value.party_role===null:(value.party_role!==null||value.binding_id!==null))ctx.addIssue({code:'custom',message:'Wrong receipt party'});
  if(value.action==='confirm_sender'&&value.party_role!=='sender'||['revoke_invitation','confirm','receive_scan','reject'].includes(value.action)&&value.party_role!=='recipient'||['bind_signature','confirm_sender'].includes(value.action)&&!value.binding_id||value.action==='capture_receipt'&&(value.binding_id!==null||value.event_id!==null))ctx.addIssue({code:'custom',message:'Wrong original receipt binding'});
});
export const authScope=z.object({actor_user_id:uuid,organization_id:uuid}).strict();
export const readSuccess=z.object({version:z.literal(1),ok:z.literal(true),scope:authScope,capabilities,result:readResult}).strict();
export const applyResult=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('policy'),policy:policyVersion}).strict(),z.object({kind:z.literal('signature'),context:signatureContext}).strict(),z.object({kind:z.literal('agreement'),agreement:accountAgreement}).strict(),z.object({kind:z.literal('consent'),consent:consentSnapshot}).strict(),z.object({kind:z.literal('receipt'),manifest:frozenManifest}).strict(),
]);
export const applySuccess=z.object({version:z.literal(1),ok:z.literal(true),scope:authScope,capabilities,receipt:mutationReceipt,result:applyResult}).strict();
export const readResponse=z.union([readSuccess,failure]),applyResponse=z.union([applySuccess,failure]);
const publicBinding=z.object({id:uuid,organization_id:uuid,signature_id:uuid,party_role:z.literal('recipient'),revision:positiveRevision,document_revision_id:uuid.nullable(),document_html_sha256:hash,classification,policy_version_id:uuid,policy_sha256:hash,policy_decision_revision:positiveRevision,agreement_sha256:hash.nullable(),source_file_sha256:hash.nullable(),source_file_bytes:z.number().int().min(1).max(20971520).nullable()}).strict().refine(value=>(value.source_file_sha256===null)===(value.source_file_bytes===null));
const publicPolicy=z.object({id:uuid,family_id:uuid,organization_id:uuid,version:positiveRevision,body_sha256:hash,classification,method:supportedMethod,purpose:policyFields.purpose,identity_requirement:identityRequirement,authority_requirement:authorityRequirement,agreement:canonicalTerms.nullable(),consent:canonicalTerms.nullable(),basis_explanation:text(),legal_sources:z.array(legalSourceReference).max(20),limitations:text()}).strict();
export const publicContext=z.object({organization_id:uuid,signature_id:uuid,current_document_revision_id:uuid.nullable(),current_document_html_sha256:hash,legacy_status:text(100),legacy_method:text(100).nullable(),latest_event_revision:revision,party_role:z.literal('recipient'),latest_party_event_revision:revision,conclusion,requirements:evidenceRequirements,binding:publicBinding.nullable(),policy:publicPolicy.nullable(),supported_methods:capabilities.shape.supported_methods,unsupported_methods:capabilities.shape.unsupported_methods,authenticated_recipient:z.boolean()}).strict().superRefine((value,ctx)=>{
  if(value.latest_party_event_revision>value.latest_event_revision||(value.binding===null)!==(value.policy===null)||value.binding&&(value.binding.organization_id!==value.organization_id||value.binding.signature_id!==value.signature_id||value.binding.revision>value.latest_party_event_revision||value.binding.policy_version_id!==value.policy?.id||value.binding.policy_sha256!==value.policy?.body_sha256||value.binding.classification.party_role==='sender')||value.policy&&(value.policy.organization_id!==value.organization_id||value.policy.classification.party_role==='sender'))ctx.addIssue({code:'custom',message:'Wrong recipient-only context'});
});
export const publicEdgeSuccess=z.discriminatedUnion('kind',[
  z.object({version:z.literal(1),ok:z.literal(true),kind:z.literal('context'),context:publicContext}).strict(),
  z.object({version:z.literal(1),ok:z.literal(true),kind:z.literal('confirmation'),context:publicContext,receipt:mutationReceipt,certificate_state:z.enum(['not_requested','pending','ready','failed'])}).strict(),
]);
export const publicEdgeResponse=z.union([publicEdgeSuccess,failure]);
