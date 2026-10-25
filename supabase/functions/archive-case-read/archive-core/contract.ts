import{z}from'zod';
export const ARCHIVE_SCHEMA_VERSION=1 as const;
export const ARCHIVE_MAX_MANIFEST_BYTES=4*1024*1024;
export const ARCHIVE_MAX_FILE_BYTES=100*1024*1024;
export const ARCHIVE_MAX_MEMBERS=10000;
/** PostgreSQL UUID identity includes historical canonical hex values without RFC version restrictions. */
export const archiveUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const archiveHash=z.string().regex(/^[0-9a-f]{64}$/);
export const archiveRevision=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const archiveInstant=z.string().datetime({offset:true});
export const archiveDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const[y,m,d]=value.split('-').map(Number);if(y<1000||y>9999)return false;const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;},'Actual Gregorian date required');
const text=z.string().min(1).max(4000).refine(value=>value.trim().length>0);
const unique=(values:string[])=>new Set(values).size===values.length;
const people=z.array(archiveUuid).max(10000).refine(unique,'Duplicate subject');
export const archiveScope=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('organization')}).strict(),
 z.object({kind:z.literal('group'),group_id:archiveUuid}).strict(),
 z.object({kind:z.literal('enrollment'),group_id:archiveUuid,enrollment_id:archiveUuid,user_id:archiveUuid}).strict(),
]);
export const archiveSourceKind=z.enum(['organization_document_version','registry_record','custom_journal','scoped_journal','group_document','admission_case','education_document','frdo_packet','signature_evidence']);
export const archiveSource=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('organization_document_version'),document_id:archiveUuid,version_id:archiveUuid,content_hash:archiveHash}).strict(),
 z.object({kind:z.literal('group_document'),document_id:archiveUuid,revision:archiveRevision,snapshot_hash:archiveHash}).strict(),
 z.object({kind:z.literal('registry_record'),record_id:archiveUuid,revision:archiveRevision,state_hash:archiveHash}).strict(),
 z.object({kind:z.literal('custom_journal'),journal_id:archiveUuid,revision:archiveRevision,snapshot_hash:archiveHash}).strict(),
 z.object({kind:z.literal('scoped_journal'),journal_id:archiveUuid,revision:archiveRevision,snapshot_hash:archiveHash}).strict(),
 z.object({kind:z.literal('admission_case'),case_id:archiveUuid,revision:archiveRevision,state_hash:archiveHash}).strict(),
 z.object({kind:z.literal('education_document'),record_id:archiveUuid,state_hash:archiveHash,artifact_id:archiveUuid,byte_sha256:archiveHash}).strict(),
 z.object({kind:z.literal('frdo_packet'),packet_id:archiveUuid,revision:archiveRevision,state_hash:archiveHash}).strict(),
 z.object({kind:z.literal('signature_evidence'),signature_id:archiveUuid,revision:archiveRevision,state_hash:archiveHash}).strict(),
]);
export const archiveDuration=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('years'),years:z.number().int().min(1).max(9000)}).strict(),
 z.object({kind:z.literal('permanent')}).strict(),
 z.object({kind:z.literal('event_bound'),event_kind:text}).strict(),
 z.object({kind:z.literal('unknown')}).strict(),
]);
export const archiveStartEvent=z.enum(['case_closed','register_ceased','contract_obligations_completed']);
export const archiveReview=z.object({actor_id:archiveUuid,recorded_at:archiveInstant,reason:text,evidence:archiveSource}).strict();
export const archiveRule=z.object({
 id:archiveUuid,revision:archiveRevision,organization_id:archiveUuid,nomenclature_version_id:archiveUuid,entry_id:archiveUuid,
 case_kind:text,case_index:z.string().min(1).max(120).refine(value=>value.trim().length>0),title:text,status:z.enum(['draft','reviewed','approved','superseded']),
 source_version_id:archiveUuid,source_sha256:archiveHash,source_checked_at:archiveInstant.nullable(),provision:text,source_note:text.nullable(),
 duration:archiveDuration,start_event:archiveStartEvent,start_rule:z.literal('next_january_first'),requires_expert_review:z.boolean(),
 legal_review:archiveReview.nullable(),center_approval:archiveReview.nullable(),effective_from:archiveDate,
}).strict();
export const archiveClosure=z.object({kind:archiveStartEvent,actual_on:archiveDate,evidence:archiveSource,recorded_at:archiveInstant,recorded_by:archiveUuid,reason:text}).strict();
export const archiveHoldEvent=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('placed'),id:archiveUuid,hold_id:archiveUuid,sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),recorded_at:archiveInstant,actor_id:archiveUuid,reason_kind:z.enum(['dispute','inspection','subject_request','other_reviewed']),reason:text,evidence:archiveSource,review_on:archiveDate.nullable()}).strict(),
 z.object({kind:z.literal('released'),id:archiveUuid,hold_id:archiveUuid,sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),recorded_at:archiveInstant,actor_id:archiveUuid,placed_event_id:archiveUuid,reason:text,evidence:archiveSource}).strict(),
]);
export const archiveMember=z.object({id:archiveUuid,source:archiveSource,required:z.boolean(),relationship:z.enum(['original','copy','evidence']),subjects:people,attribution_actors:people,file_ids:z.array(archiveUuid).max(10000).refine(unique),label:text}).strict();
export const archiveCase=z.object({schema_version:z.literal(1),id:archiveUuid,organization_id:archiveUuid,scope:archiveScope,revision:archiveRevision,state_hash:archiveHash,
 title:text,opened_on:archiveDate,rule:archiveRule.nullable(),closure:archiveClosure.nullable(),hold_events:z.array(archiveHoldEvent).max(10000),
 members:z.array(archiveMember).max(ARCHIVE_MAX_MEMBERS),retained_subjects:people,attribution_actors:people,
 state:z.enum(['open','closed','review_required','held','disposal_pending','destroyed']),
}).strict().superRefine((value,ctx)=>{
 if(!unique(value.members.map(x=>x.id)))ctx.addIssue({code:'custom',message:'Duplicate archive member'});
 if(value.rule&&value.rule.organization_id!==value.organization_id)ctx.addIssue({code:'custom',message:'Foreign retention rule'});
 if(value.closure&&value.closure.actual_on<value.opened_on)ctx.addIssue({code:'custom',message:'Closure predates opening'});
 for(const member of value.members)if(member.subjects.some(id=>!value.retained_subjects.includes(id)))ctx.addIssue({code:'custom',message:'Case omits a retained source subject'});
});
export const archiveErrorCode=z.enum(['INVALID_INPUT','ACCESS_DENIED','NOT_FOUND','REVISION_CONFLICT','SOURCE_CHANGED','SOURCE_UNAVAILABLE','RETENTION_UNCLASSIFIED','RETENTION_NOT_EXPIRED','RETENTION_PERMANENT','CLOSURE_REQUIRED','EVENT_MISMATCH','LEGAL_HOLD','HOLD_HISTORY_INVALID','APPROVAL_REQUIRED','APPROVAL_STALE','EXPERT_REVIEW_REQUIRED','SHARED_FILE_RETAINED','BACKUP_POLICY_UNVERIFIED','PACKAGE_INCOMPLETE','HASH_MISMATCH','RESTORE_MAPPING_REQUIRED','UNSUPPORTED_STORAGE_GENERATION','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE']);
export class ArchiveError extends Error{constructor(public code:z.infer<typeof archiveErrorCode>){super(code);this.name='ArchiveError';}}
export type ArchiveSource=z.infer<typeof archiveSource>;
export type ArchiveCase=z.infer<typeof archiveCase>;
export type ArchiveRule=z.infer<typeof archiveRule>;
export type ArchiveHoldEvent=(z.infer<(typeof archiveHoldEvent.options)[0]>&{kind:'placed'})|(z.infer<(typeof archiveHoldEvent.options)[1]>&{kind:'released'});
export interface ArchiveCurrentGuard{assertCurrent():void}
export const archiveFile=z.object({id:archiveUuid,member_id:archiveUuid,source:archiveSource,byte_sha256:archiveHash,byte_size:z.number().int().positive().max(ARCHIVE_MAX_FILE_BYTES),mime_type:z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i).max(120),original_name:z.string().min(1).max(255).refine(value=>!/[\\/\u0000-\u001f]/.test(value)),archive_path:z.string().max(160)}).strict().superRefine((file,ctx)=>{if(file.archive_path!=='files/'+file.id+'/'+file.byte_sha256+'.bin')ctx.addIssue({code:'custom',message:'Exact generated safe archive path required'});});
export type ArchiveJson=null|boolean|number|string|ArchiveJson[]|{[key:string]:ArchiveJson};
export const archiveJson:z.ZodType<ArchiveJson>=z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),z.string().max(1000000),z.array(archiveJson).max(100000),z.record(z.string().max(120),archiveJson)]));
export const archiveCapturedEvent=z.object({id:archiveUuid,sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),source_revision:archiveRevision.nullable(),payload:archiveJson,payload_sha256:archiveHash}).strict();
export type ArchiveCapturedEvent=z.infer<typeof archiveCapturedEvent>;
export const archiveCapturedRecord=z.object({export_id:archiveUuid,member_id:archiveUuid,source:archiveSource,record_data:archiveJson,record_sha256:archiveHash,references:z.array(archiveUuid).max(10000).refine(unique),history_kind:z.enum(['immutable_source','revision_stream','unverified_legacy']),expected_event_count:z.number().int().min(0).max(100000),events:z.array(archiveCapturedEvent).max(100000)}).strict().superRefine((v,c)=>{if(v.history_kind==='immutable_source'&&(v.events.length||v.expected_event_count||v.source.kind!=='organization_document_version'))c.addIssue({code:'custom',message:'Immutable-source exemption applies only to one exact org document version'});if(v.events.some((e,index)=>e.sequence!==index+1)||!unique(v.events.map(e=>e.id)))c.addIssue({code:'custom',message:'Contiguous captured history required'});});
/** A frozen immutable journal, not a new decision or a current legal approval. */
export const archiveDisposalRevision=z.object({id:archiveUuid,act_id:archiveUuid,revision:archiveRevision,prior_id:archiveUuid.nullable(),sequence:archiveRevision,record_data:z.object({format:z.literal('postgresql-jsonb-v1'),value_jsonb_text:z.string().min(1).max(4194304)}).strict(),record_sha256:archiveHash}).strict();
export const archiveDisposalJournal=z.object({ceiling:archiveRevision,revision_count:archiveRevision,revisions:z.array(archiveDisposalRevision).max(10000),journal_sha256:archiveHash}).strict().superRefine((v,c)=>{
 if(v.revision_count!==v.revisions.length||v.ceiling!==(v.revisions.at(-1)?.sequence??0)||!unique(v.revisions.map(r=>r.id)))c.addIssue({code:'custom',message:'Frozen disposal journal count/ceiling differs'});
 const heads=new Map<string,{id:string;revision:number}>();let previous=0;
 for(const row of v.revisions){const prior=heads.get(row.act_id);if(row.sequence<=previous||row.revision!==(prior?.revision??0)+1||row.prior_id!==(prior?.id??null))c.addIssue({code:'custom',message:'Full immutable disposal revision chain required'});previous=row.sequence;heads.set(row.act_id,{id:row.id,revision:row.revision});}
});
export type ArchiveDisposalJournal=z.infer<typeof archiveDisposalJournal>;
const archiveManifestV1=z.object({schema_version:z.literal(1),package_id:archiveUuid,organization_id:archiveUuid,case_id:archiveUuid,case_revision:archiveRevision,case_state_hash:archiveHash,created_at:archiveInstant,
 completeness:z.enum(['complete','partial']),case_snapshot:archiveCase,members:z.array(archiveMember).max(ARCHIVE_MAX_MEMBERS),case_events:z.array(archiveCapturedEvent).max(100000),records:z.array(archiveCapturedRecord).max(ARCHIVE_MAX_MEMBERS),files:z.array(archiveFile).max(10000),missing_member_ids:z.array(archiveUuid).max(ARCHIVE_MAX_MEMBERS).refine(unique),blockers:z.array(archiveErrorCode).max(100),
}).strict();
const archiveManifestV2=archiveManifestV1.extend({schema_version:z.literal(2),supplementary_members:z.array(archiveMember).max(ARCHIVE_MAX_MEMBERS),disposal_journal:archiveDisposalJournal}).strict();
export const archiveManifest=z.discriminatedUnion('schema_version',[archiveManifestV1,archiveManifestV2]).superRefine((value,ctx)=>{
 const original=value.case_snapshot;const pinnedMembers=value.schema_version===2?[...original.members,...value.supplementary_members]:original.members;
 if(!unique(pinnedMembers.map(m=>m.id))||pinnedMembers.length>ARCHIVE_MAX_MEMBERS)ctx.addIssue({code:'custom',message:'Supplement member identity collision'});
 if(value.schema_version===2){if(value.supplementary_members.some(m=>m.source.kind!=='organization_document_version'))ctx.addIssue({code:'custom',message:'Supplement captures only exact organization document versions'});for(const row of value.disposal_journal.revisions){try{const data=JSON.parse(row.record_data.value_jsonb_text);if(data.id!==row.id||data.act_id!==row.act_id||data.revision!==row.revision||data.prior_id!==row.prior_id||data.sequence!==row.sequence||data.organization_id!==value.organization_id||data.case_id!==value.case_id||!Number.isSafeInteger(data.case_revision)||data.case_revision<1||data.case_revision>value.case_revision||!archiveHash.safeParse(data.case_state_hash).success||!archiveCase.safeParse(data.snapshot?.case).success||!['draft','assess','approve'].includes(data.action_kind)||!['blocked_draft','ready_for_center_approval','center_approved'].includes(data.state)||data.destruction_authorized!==false||data.physical_cleanup_claim!==false||data.snapshot?.case?.id!==value.case_id||data.snapshot?.case?.organization_id!==value.organization_id||data.snapshot?.case?.revision!==data.case_revision||data.snapshot?.case?.state_hash!==data.case_state_hash)throw Error();const visit=(node:unknown):void=>{if(node&&typeof node==='object'){const ref=node as Record<string,unknown>;if(ref.kind==='organization_document_version'){const source=archiveSource.parse(ref);if(!value.members.some(m=>JSON.stringify(m.source)===JSON.stringify(source)))throw Error();}for(const child of Object.values(node))visit(child);}};visit(data);}catch{ctx.addIssue({code:'custom',message:'Exact historical disposal row binding required'});}}}
if(original.id!==value.case_id||original.organization_id!==value.organization_id||original.revision!==value.case_revision||original.state_hash!==value.case_state_hash)ctx.addIssue({code:'custom',message:'Exact case snapshot binding required'});
 if(!unique(value.members.map(x=>x.id))||!unique(value.files.map(x=>x.id))||!unique(value.files.map(x=>x.archive_path)))ctx.addIssue({code:'custom',message:'Duplicate archive identities or paths'});
 const keys=new Set(value.members.map(x=>x.id));const missing=pinnedMembers.filter(x=>!keys.has(x.id)).map(x=>x.id).sort();if(JSON.stringify(missing)!==JSON.stringify([...value.missing_member_ids].sort()))ctx.addIssue({code:'custom',message:'Required member completeness differs'});
 for(const member of value.members){const old=pinnedMembers.find(x=>x.id===member.id);if(!old||JSON.stringify(old)!==JSON.stringify(member))ctx.addIssue({code:'custom',message:'Archive member differs from pinned case snapshot'});}
 for(const file of value.files){const member=value.members.find(x=>x.id===file.member_id);if(!member||!member.file_ids.includes(file.id)||JSON.stringify(member.source)!==JSON.stringify(file.source))ctx.addIssue({code:'custom',message:'File lacks exact source member binding'});}
 const recordIds=new Set(value.records.map(r=>r.export_id));if(recordIds.size!==value.records.length||!unique(value.records.map(r=>r.member_id)))ctx.addIssue({code:'custom',message:'Duplicate captured record/member'});
 for(const record of value.records){const member=value.members.find(m=>m.id===record.member_id);if(!member||JSON.stringify(member.source)!==JSON.stringify(record.source)||record.references.some(id=>!recordIds.has(id)))ctx.addIssue({code:'custom',message:'Record source/reference closure differs'});}
 const missingRecords=value.members.some(m=>!value.records.some(r=>r.member_id===m.id));const incompleteHistory=value.records.some(r=>r.history_kind==='unverified_legacy'||r.expected_event_count!==r.events.length);
 if(value.case_events.some((e,index)=>e.sequence!==index+1||e.source_revision!==index+1)||!unique(value.case_events.map(e=>e.id)))ctx.addIssue({code:'custom',message:'Contiguous archive case history required'});
 const caseHistoryIncomplete=value.case_events.length!==value.case_revision;
 const missingFiles=value.members.some(m=>m.file_ids.some(id=>!value.files.some(f=>f.id===id&&f.member_id===m.id)));
 if(value.completeness==='complete'&&(missing.length||missingFiles||missingRecords||incompleteHistory||caseHistoryIncomplete||value.blockers.length))ctx.addIssue({code:'custom',message:'Incomplete package cannot claim completeness'});
});
export type ArchiveManifest=z.infer<typeof archiveManifest>;
export type ArchiveFile=z.infer<typeof archiveFile>;
export const archiveCursor=z.string().min(1).max(4096);
export const archiveReadArgs=z.object({organization_id:archiveUuid,scope:archiveScope,query:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('cases'),after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('detail'),case_id:archiveUuid}).strict(),
 z.object({kind:z.literal('history'),case_id:archiveUuid,ceiling_revision:archiveRevision,before_revision:archiveRevision.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('rules'),after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('authorities'),after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('restores'),case_id:archiveUuid,after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({kind:z.literal('restore'),restore_id:archiveUuid}).strict(),
 z.object({kind:z.literal('source_inventory'),source_kind:archiveSourceKind,search:z.string().trim().max(200),after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(25)}).strict(),
 z.object({kind:z.literal('source'),source:archiveSource}).strict(),
 z.object({kind:z.literal('packages'),case_id:archiveUuid,after_cursor:archiveCursor.nullable(),limit:z.number().int().min(1).max(50)}).strict(),
])}).strict();
export const archiveRuleDraft=z.object({nomenclature_version_id:archiveUuid,entry_id:archiveUuid,case_kind:text,case_index:z.string().min(1).max(120),title:text,
 source:archiveSource,declared_source_byte_sha256:archiveHash,provision:text,source_note:text.nullable(),duration:archiveDuration,start_event:archiveStartEvent,start_rule:z.literal('next_january_first'),requires_expert_review:z.boolean(),effective_from:archiveDate,
}).strict().refine(value=>value.source.kind==='organization_document_version','Exact immutable source version required');
export const archiveDecisionInput=z.object({reason:text,evidence:archiveSource}).strict();
export const archiveAction=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('open_case'),title:text,opened_on:archiveDate}).strict(),
 z.object({kind:z.literal('link_source'),source:archiveSource,required:z.boolean(),relationship:z.enum(['original','copy','evidence']),declared_subjects:people}).strict(),
 z.object({kind:z.literal('record_closure'),closure_kind:archiveStartEvent,actual_on:archiveDate,reason:text,evidence:archiveSource}).strict(),
 z.object({kind:z.literal('place_hold'),hold_id:archiveUuid,reason_kind:z.enum(['dispute','inspection','subject_request','other_reviewed']),reason:text,evidence:archiveSource,review_on:archiveDate.nullable()}).strict(),
 z.object({kind:z.literal('release_hold'),hold_id:archiveUuid,placed_event_id:archiveUuid,reason:text,evidence:archiveSource}).strict(),
 z.object({kind:z.literal('save_rule_draft'),draft:archiveRuleDraft}).strict(),
 z.object({kind:z.literal('review_rule'),rule_version_id:archiveUuid,decision:archiveDecisionInput}).strict(),
 z.object({kind:z.literal('approve_rule'),rule_version_id:archiveUuid,decision:archiveDecisionInput}).strict(),
 z.object({kind:z.literal('classify_case'),rule_version_id:archiveUuid,reason:text}).strict(),
 z.object({kind:z.literal('appoint_authority'),authority_id:archiveUuid,expected_authority_revision:archiveRevision,user_id:archiveUuid,roles:z.array(z.enum(['legal_reviewer','center_approver','archive_operator','destruction_reviewer'])).min(1).max(4).refine(unique),decision:archiveDecisionInput}).strict(),
 z.object({kind:z.literal('revoke_authority'),authority_id:archiveUuid,expected_authority_revision:archiveRevision,decision:archiveDecisionInput}).strict(),
 z.object({kind:z.literal('prepare_package')}).strict(),
 z.object({kind:z.literal('prepare_restore'),package_id:archiveUuid}).strict(),
 z.object({kind:z.literal('prepare_destruction_plan')}).strict(),
]);
const organizationActions=new Set(['save_rule_draft','review_rule','approve_rule','appoint_authority','revoke_authority']);
export const archiveApplyArgs=z.object({organization_id:archiveUuid,scope:archiveScope,request_id:archiveUuid,case_id:archiveUuid.nullable(),expected_revision:archiveRevision,action:archiveAction}).strict().superRefine((value,ctx)=>{
 const independent=value.action.kind==='open_case'||organizationActions.has(value.action.kind);
 if(independent!==(value.case_id===null)||independent&&value.expected_revision!==0||organizationActions.has(value.action.kind)&&value.scope.kind!=='organization')ctx.addIssue({code:'custom',message:'Exact organization or current case reference required'});
});
export const archiveCapabilities=z.object({can_read:z.boolean(),can_write:z.boolean(),can_appoint:z.boolean(),can_review_rules:z.boolean(),can_approve_rules:z.boolean(),can_operate:z.boolean(),can_prepare_destruction_review:z.boolean(),can_execute_destruction:z.literal(false)}).strict();

export const archivePackageSummary=z.object({id:archiveUuid,case_id:archiveUuid,organization_id:archiveUuid,actor_id:archiveUuid.optional(),request_id:archiveUuid.optional(),input_revision:archiveRevision,input_state_hash:archiveHash,phase:z.enum(['prepared','generating','sealed','failed']),manifest_sha256:archiveHash.nullable(),manifest_bytes:z.number().int().positive().max(ARCHIVE_MAX_MANIFEST_BYTES).nullable(),completeness:z.enum(['partial','complete']),blockers:z.array(archiveErrorCode).max(100),created_at:archiveInstant,sealed_at:archiveInstant.nullable()}).strict();
export const archiveAuthority=z.object({id:archiveUuid,organization_id:archiveUuid,authority_id:archiveUuid,revision:archiveRevision,appointed_user_id:archiveUuid,roles:z.array(z.enum(['legal_reviewer','center_approver','archive_operator','destruction_reviewer'])).min(1).max(4),state:z.enum(['appointed','revoked']),evidence:archiveSource,reason:text,actor_id:archiveUuid,recorded_at:archiveInstant}).strict();
export const archiveRestore=z.object({id:archiveUuid,organization_id:archiveUuid,package_id:archiveUuid,actor_id:archiveUuid,request_id:archiveUuid,manifest_sha256:archiveHash,state:z.enum(['prepared','verifying','verified','failed']),verified_file_ids:z.array(archiveUuid).max(10000).refine(unique),projection_sha256:archiveHash.nullable(),created_at:archiveInstant,completed_at:archiveInstant.nullable(),historical_only:z.literal(true),live_business_actions:z.literal(0),source_reissued:z.literal(false)}).strict().superRefine((value,ctx)=>{if(value.state==='verified'&&(!value.projection_sha256||!value.completed_at))ctx.addIssue({code:'custom',message:'Verified historical restore requires projection hash and completion evidence'});});
export const archiveSourcePreview=z.object({source:archiveSource,label:text,subjects:people,attribution_actors:people,history_kind:z.enum(['immutable_source','revision_stream','unverified_legacy']),expected_event_count:archiveRevision,file_count:archiveRevision,blockers:z.array(archiveErrorCode).max(100)}).strict();
export const archiveReadResult=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('cases'),items:z.array(archiveCase).max(50),next_cursor:archiveCursor.nullable()}).strict(),
 z.object({kind:z.literal('rules'),items:z.array(archiveRule).max(50),next_cursor:archiveCursor.nullable()}).strict(),
 z.object({kind:z.literal('detail'),case:archiveCase}).strict(),
 z.object({kind:z.literal('history'),case_id:archiveUuid,ceiling_revision:archiveRevision,events:z.array(archiveCapturedEvent).max(50),next_before_revision:archiveRevision.nullable()}).strict(),
 z.object({kind:z.literal('packages'),case_id:archiveUuid,packages:z.array(archivePackageSummary).max(50),next_cursor:archiveCursor.nullable()}).strict(),
 z.object({kind:z.literal('restores'),case_id:archiveUuid,restores:z.array(archiveRestore).max(50),next_cursor:archiveCursor.nullable()}).strict(),
 z.object({kind:z.literal('restore'),restore:archiveRestore,projection:archiveJson.nullable()}).strict(),
 z.object({kind:z.literal('authorities'),authorities:z.array(archiveAuthority).max(50),next_cursor:archiveCursor.nullable()}).strict(),
 archiveSourcePreview.extend({kind:z.literal('source')}).strict(),
 z.object({kind:z.literal('source_inventory'),source_kind:archiveSourceKind,search:z.string().trim().max(200),items:z.array(archiveSourcePreview).max(25),next_cursor:archiveCursor.nullable()}).strict(),
]);
export const archiveReadEnvelope=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,capabilities:archiveCapabilities,result:archiveReadResult}).strict();
export const archiveReceipt=z.object({version:z.literal(1),ok:z.literal(true),organization_id:archiveUuid,scope:archiveScope,actor_id:archiveUuid,request_id:archiveUuid,action_kind:archiveAction.options[0].shape.kind.or(z.string().min(1).max(60)),case_id:archiveUuid.nullable(),revision:archiveRevision.nullable(),state_hash:archiveHash.nullable(),value:archiveJson,replayed:z.boolean()}).strict();
export type ArchiveScope=z.infer<typeof archiveScope>;
export type ArchiveReadQuery=z.infer<typeof archiveReadArgs>['query'];
export type ArchiveRead=z.infer<typeof archiveReadEnvelope>;
export type ArchiveApply=z.infer<typeof archiveApplyArgs>;
export type ArchiveReceipt=z.infer<typeof archiveReceipt>;

export type ArchiveSourceKind=z.infer<typeof archiveSourceKind>;
export type ArchiveSourceChoice=z.infer<typeof archiveSourcePreview>;
export type ArchivePackageSummary=z.infer<typeof archivePackageSummary>;
export type ArchiveRestore=z.infer<typeof archiveRestore>;
export type ArchiveCapabilities=z.infer<typeof archiveCapabilities>;
export type ArchiveAuthority=z.infer<typeof archiveAuthority>;
