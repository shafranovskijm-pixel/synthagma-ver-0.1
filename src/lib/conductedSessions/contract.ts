import { z } from 'zod';
import * as g from '@/lib/groupEducationFacts/contract';
import { outcomeEnvelopeSchema } from '@/lib/learningOutcomes/contract';

export const attendanceStatus = z.enum(['present','absent','excused']);
const reason = z.string().min(1).max(2000).refine(v=>v.trim()===v);
export const attendanceInput = z.object({user_id:g.educationUuid,status:attendanceStatus}).strict();
export const attendanceRow = z.object({
 user_id:g.educationUuid,subject_label:z.string().min(1).max(240).nullable(),label_state:z.enum(['available','unavailable','redacted']),
 label_observed_at:g.educationInstant.nullable(),label_source:g.labelSourceSchema.nullable(),
 enrollment_id:g.educationUuid,program_enrollment_snapshot_id:g.educationUuid,association:z.literal('confirmed'),
 membership_basis:z.enum(['observed','corrected']),effective_from:g.educationInstant.nullable(),effective_until:g.educationInstant.nullable(),
 observed_since:g.educationInstant,source_event_ids:z.array(g.educationUuid).max(4),status:attendanceStatus,
}).strict();
const sourceFields = z.object({schema_version:z.literal(1),scope:g.educationScopeSchema,
 calendar_version_id:g.educationUuid,calendar_hash:g.educationHash,lesson:g.lessonSchema,timezone:g.educationZone,
 snapshot_id:g.educationUuid,snapshot_as_of:g.educationInstant,knowledge_revision:g.educationRevision,coverage_segment_id:g.educationUuid,
 roster_hash:g.educationHash,source_hash:g.educationHash,program_ref:g.programRefSchema,program_proof:g.retainedProgramProofSchema,
 roster_rows:z.array(g.rosterRowSchema).max(1000),
}).strict();
export const sessionSource = sourceFields.refine(v=>v.lesson.status==='planned' && v.roster_rows.every(r=>r.association==='confirmed'));
export const sessionHeader = z.object({id:g.educationUuid,lesson_id:g.educationUuid,calendar_version_id:g.educationUuid,
 calendar_hash:g.educationHash,snapshot_id:g.educationUuid,revision:g.educationRevision,starts_at:g.educationInstant,ends_at:g.educationInstant,
 content_hash:g.educationHash,redacted:z.boolean()}).strict();
export const sessionList = z.object({schema_version:z.literal(1),scope:g.educationScopeSchema,sessions:z.array(sessionHeader).max(50),next_after_id:g.educationUuid.nullable()}).strict();
export const sessionOutcome = z.object({user_id:g.educationUuid,enrollment_id:g.educationUuid,program_enrollment_snapshot_id:g.educationUuid,outcome:outcomeEnvelopeSchema.nullable()}).strict();
export const sessionVersion = z.object({id:g.educationUuid,session_id:g.educationUuid,revision:g.educationRevision,
 starts_at:g.educationInstant,ends_at:g.educationInstant,academic_hours:g.academicHours,teacher_user_id:g.educationUuid.nullable(),
 attendance:z.array(attendanceRow).max(1000),reason,actor_id:g.educationUuid.nullable(),source_proof:sessionSource,
 content_hash:g.educationHash,recorded_at:g.educationInstant,supersedes_id:g.educationUuid.nullable(),redacted:z.literal(false),
}).strict();
export const sessionDetail = z.object({schema_version:z.literal(1),scope:g.educationScopeSchema,
 session:z.object({id:g.educationUuid,calendar_version_id:g.educationUuid,calendar_hash:g.educationHash,lesson_id:g.educationUuid,snapshot_id:g.educationUuid}).strict(),
 version:sessionVersion,source_current:z.boolean(),outcomes:z.array(sessionOutcome).max(50),next_after_user_id:g.educationUuid.nullable(),can_write:z.boolean(),
 draft_heads:z.array(z.object({id:g.educationUuid,kind:z.enum(['journal','protocol','education_document']),revision:g.educationRevision,content_hash:g.educationHash,redacted:z.boolean()}).strict()).max(3),
}).strict();
export const draftKind = z.enum(['journal','protocol','education_document']);
export const draftSource = z.object({schema_version:z.literal(1),kind:draftKind,status:z.literal('draft_requires_human_review'),officially_issued:z.literal(false),signature:z.null(),registry_number:z.null(),
 display_label_notice:z.literal('display_labels_observed_separately_not_verified_legal_names'),scope:g.educationScopeSchema,
 session_id:g.educationUuid,session_version_id:g.educationUuid,session_revision:g.educationRevision,session_hash:g.educationHash,
 session_source:sourceFields.omit({roster_rows:true}),starts_at:g.educationInstant,ends_at:g.educationInstant,academic_hours:g.academicHours,teacher_user_id:g.educationUuid,
 attendance:z.array(attendanceRow).min(1).max(100),outcomes:z.array(sessionOutcome).min(1).max(100),
}).strict();
export const draftResponse = z.object({schema_version:z.literal(1),scope:g.educationScopeSchema,draft:z.object({
 id:g.educationUuid,session_id:g.educationUuid,kind:draftKind,revision:g.educationRevision,supersedes_id:g.educationUuid.nullable(),
 source_proof:draftSource.nullable(),content_hash:g.educationHash,recorded_at:g.educationInstant,actor_id:g.educationUuid.nullable(),
 source_current:z.boolean(),redacted:z.boolean(),officially_issued:z.literal(false),
}).strict()}).strict().refine(v=>v.draft.source_current===!!v.draft.source_proof && !(v.draft.redacted&&v.draft.source_current));

const attendance = z.array(attendanceInput).min(1).max(1000).refine(v=>new Set(v.map(r=>r.user_id)).size===v.length);
export const confirmSession = z.object({action:z.literal('confirm_session'),calendar_version_id:g.educationUuid,calendar_hash:g.educationHash,lesson_id:g.educationUuid,snapshot_id:g.educationUuid,
 starts_at:g.educationInstant,ends_at:g.educationInstant,academic_hours:g.academicHours,teacher_user_id:g.educationUuid,attendance,reason,human_attested:z.literal(true),
}).strict().refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at)&&Date.parse(v.ends_at)-Date.parse(v.starts_at)<=86400000);
export const correctAttendance = z.object({action:z.literal('correct_attendance'),session_id:g.educationUuid,expected_content_hash:g.educationHash,attendance,reason,human_attested:z.literal(true)}).strict();
export const createDraft = z.object({action:z.literal('create_draft'),session_id:g.educationUuid,expected_content_hash:g.educationHash,kind:draftKind,
 expected_draft_revision:g.educationExpectedRevision,student_ids:z.array(g.educationUuid).min(1).max(100).refine(v=>new Set(v).size===v.length),reason,human_review_required:z.literal(true)}).strict();
export const sessionAction = z.union([confirmSession,correctAttendance,createDraft]);
export const sessionReceipt = z.object({schema_version:z.literal(1),receipt:z.object({request_id:g.educationUuid,action:z.enum(['confirm_session','correct_attendance','create_draft']),
 session_id:g.educationUuid,revision:g.educationRevision,version_id:g.educationUuid,content_hash:g.educationHash,
 draft_id:g.educationUuid.nullable(),draft_revision:g.educationRevision.nullable(),draft_hash:g.educationHash.nullable(),replayed:z.boolean(),
}).strict()}).strict().refine(v=>(v.receipt.action==='create_draft')===(v.receipt.draft_id!==null&&v.receipt.draft_revision!==null&&v.receipt.draft_hash!==null));
export type SessionAction=g.RequiredWire<z.infer<typeof sessionAction>>;
export type SessionList=g.RequiredWire<z.infer<typeof sessionList>>;
export type SessionDetail=g.RequiredWire<z.infer<typeof sessionDetail>>;
export type DraftResponse=g.RequiredWire<z.infer<typeof draftResponse>>;
export type AttendanceInput=g.RequiredWire<z.infer<typeof attendanceInput>>;
export type DraftKind=z.infer<typeof draftKind>;
const sameScope=(a:g.EducationScope,b:g.EducationScope)=>a.organization_id===b.organization_id&&a.group_id===b.group_id&&a.course_id===b.course_id;
function micros(value:string){const f=value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]??'';return BigInt(Date.parse(value))*BigInt(1000)+BigInt(f.padEnd(6,'0').slice(3,6)||'0');}

export function assertSessionScope(value:SessionDetail,org:string,group:string,course?:string):SessionDetail {
 const s=value.session,v=value.version,p=v.source_proof;
 if(value.scope.organization_id!==org||value.scope.group_id!==group||course&&value.scope.course_id!==course||s.id!==v.session_id
  ||!sameScope(value.scope,p.scope)||s.calendar_version_id!==p.calendar_version_id||s.calendar_hash!==p.calendar_hash||s.snapshot_id!==p.snapshot_id||s.lesson_id!==p.lesson.lesson_id
  ||micros(v.starts_at)!==micros(p.snapshot_as_of)||micros(v.ends_at)<=micros(v.starts_at)
  ||new Set(v.attendance.map(r=>r.user_id)).size!==v.attendance.length
  ||new Set(value.draft_heads.map(r=>r.kind)).size!==value.draft_heads.length
  ||new Set(value.outcomes.map(r=>r.user_id)).size!==value.outcomes.length||value.source_current&&value.outcomes.length!==v.attendance.length||!value.source_current&&value.outcomes.length!==0
  ||v.attendance.some(r=>!p.roster_rows.some(x=>x.user_id===r.user_id&&x.enrollment_id===r.enrollment_id&&x.program_enrollment_snapshot_id===r.program_enrollment_snapshot_id))
  ||value.outcomes.some(o=>!v.attendance.some(r=>r.user_id===o.user_id&&r.enrollment_id===o.enrollment_id&&r.program_enrollment_snapshot_id===o.program_enrollment_snapshot_id)
    ||o.outcome&&(o.outcome.audience!=='staff'||o.outcome.scope.organization_id!==org||o.outcome.scope.group_id!==group||o.outcome.scope.course_id!==value.scope.course_id||o.outcome.scope.user_id!==o.user_id||o.outcome.scope.enrollment_id!==o.enrollment_id||o.outcome.scope.program_enrollment_snapshot_id!==o.program_enrollment_snapshot_id||o.outcome.scope.program_version_id!==p.program_ref.version_id))) throw new Error('UC_SESSION_INVALID_RESPONSE');
 return value;
}
export function assertDraftScope(value:DraftResponse,org:string,group:string,course?:string):DraftResponse {
 const d=value.draft,p=d.source_proof;
 if(value.scope.organization_id!==org||value.scope.group_id!==group||course&&value.scope.course_id!==course)throw new Error('UC_SESSION_INVALID_RESPONSE');
 if(p&&(!sameScope(value.scope,p.scope)||!sameScope(p.scope,p.session_source.scope)||p.session_id!==d.session_id||p.kind!==d.kind
  ||micros(p.starts_at)!==micros(p.session_source.snapshot_as_of)||p.teacher_user_id!==p.session_source.lesson.teacher_user_id
  ||new Set(p.attendance.map(r=>r.user_id)).size!==p.attendance.length||p.outcomes.length!==p.attendance.length||new Set(p.outcomes.map(r=>r.user_id)).size!==p.outcomes.length
  ||p.outcomes.some(o=>!p.attendance.some(r=>r.user_id===o.user_id&&r.enrollment_id===o.enrollment_id&&r.program_enrollment_snapshot_id===o.program_enrollment_snapshot_id)
   ||o.outcome&&(o.outcome.audience!=='staff'||o.outcome.scope.organization_id!==org||o.outcome.scope.group_id!==group||o.outcome.scope.course_id!==p.scope.course_id||o.outcome.scope.user_id!==o.user_id||o.outcome.scope.enrollment_id!==o.enrollment_id||o.outcome.scope.program_enrollment_snapshot_id!==o.program_enrollment_snapshot_id||o.outcome.scope.program_version_id!==p.session_source.program_ref.version_id)
   ||p.kind!=='journal'&&(!o.outcome||o.outcome.decision_relation!=='current_inputs'||!o.outcome.last_decision||p.kind==='education_document'&&o.outcome.last_decision.outcome!=='passed'))))throw new Error('UC_SESSION_INVALID_RESPONSE');
 return value;
}
