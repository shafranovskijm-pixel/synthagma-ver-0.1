import { compatibleArtifactSnapshot,id,time,scope,hash } from '@/lib/groupEducationFacts/__tests__/fixtures';
import { outcome } from '@/lib/learningOutcomes/__tests__/fixtures';
import { sessionDetail,type DraftResponse,type SessionAction,type SessionDetail } from '../contract';
export {id,time,scope,hash};
export function detail():SessionDetail {
 const snap=compatibleArtifactSnapshot(),lesson=snap.projection.calendar.lessons[0];
 const source={schema_version:1 as const,scope,calendar_version_id:snap.header.calendar_version_id,calendar_hash:hash,lesson,timezone:'Europe/Moscow',snapshot_id:snap.header.id,snapshot_as_of:time,knowledge_revision:1,coverage_segment_id:id(10),roster_hash:hash,source_hash:hash,program_ref:snap.header.program_ref,program_proof:snap.projection.program_facts,roster_rows:snap.rows};
 const row={...snap.rows[0],enrollment_id:snap.rows[0].enrollment_id!,program_enrollment_snapshot_id:snap.rows[0].program_enrollment_snapshot_id!,association:'confirmed' as const,status:'present' as const};
 const o=outcome();o.scope={organization_id:scope.organization_id,group_id:scope.group_id,course_id:scope.course_id,user_id:row.user_id,enrollment_id:row.enrollment_id,program_enrollment_snapshot_id:row.program_enrollment_snapshot_id,program_version_id:source.program_ref.version_id};
 // Strict runtime parsing validates the synthetic wire before restoring required-key types.
 return sessionDetail.parse({schema_version:1,scope,session:{id:id(60),calendar_version_id:source.calendar_version_id,calendar_hash:hash,lesson_id:lesson.lesson_id,snapshot_id:source.snapshot_id},version:{id:id(61),session_id:id(60),revision:1,starts_at:time,ends_at:'2026-10-19T05:00:00.123456+00:00',academic_hours:'1.5',teacher_user_id:lesson.teacher_user_id,attendance:[row],reason:'Синтетическая проверка занятия',actor_id:id(40),source_proof:source,content_hash:hash,recorded_at:time,supersedes_id:null,redacted:false},source_current:true,outcomes:[{user_id:row.user_id,enrollment_id:row.enrollment_id,program_enrollment_snapshot_id:row.program_enrollment_snapshot_id,outcome:o}],next_after_user_id:null,can_write:true,draft_heads:[]}) as SessionDetail;
}
export function draft():DraftResponse {
 const d=detail(),v=d.version;const {roster_rows:_,...source}=v.source_proof;
 return {schema_version:1,scope,draft:{id:id(70),session_id:d.session.id,kind:'journal',revision:1,supersedes_id:null,content_hash:hash,recorded_at:time,actor_id:id(40),source_current:true,redacted:false,officially_issued:false,source_proof:{schema_version:1,kind:'journal',status:'draft_requires_human_review',officially_issued:false,signature:null,registry_number:null,display_label_notice:'display_labels_observed_separately_not_verified_legal_names',scope,session_id:d.session.id,session_version_id:v.id,session_revision:v.revision,session_hash:v.content_hash,session_source:source,starts_at:v.starts_at,ends_at:v.ends_at,academic_hours:v.academic_hours,teacher_user_id:v.teacher_user_id!,attendance:v.attendance,outcomes:d.outcomes}}};
}
export function confirm():SessionAction {
 const d=detail(),v=d.version,p=v.source_proof;return {action:'confirm_session',calendar_version_id:p.calendar_version_id,calendar_hash:p.calendar_hash,lesson_id:p.lesson.lesson_id,snapshot_id:p.snapshot_id,starts_at:v.starts_at,ends_at:v.ends_at,academic_hours:v.academic_hours,teacher_user_id:v.teacher_user_id!,attendance:v.attendance.map(r=>({user_id:r.user_id,status:r.status})),reason:v.reason,human_attested:true};
}
export function receipt(requestId=id(80),action='confirm_session') {const d=detail();return {schema_version:1,receipt:{request_id:requestId,action,session_id:d.session.id,revision:1,version_id:d.version.id,content_hash:hash,draft_id:null,draft_revision:null,draft_hash:null,replayed:false}};}
