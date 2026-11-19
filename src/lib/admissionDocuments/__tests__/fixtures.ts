import type { AdmissionDocumentScope } from '../contract';
import { wireScope } from '../contract';
export const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ids={org:id(1),actor:id(2),learner:id(3),group:id(4),enrollment:id(5),course:id(6),draft:id(7),peer:id(8)};
export const enrollmentScope:AdmissionDocumentScope={kind:'enrollment',enrollmentId:ids.enrollment,groupId:ids.group};
export const settings=(scope:AdmissionDocumentScope=enrollmentScope):any=>({
 schema_version:1,organization_id:ids.org,scope:wireScope(scope),revision:0,
 preferences:{enabled:null,document_date:null,effective_admission_date:null,timezone:null},
 effective:{enabled:true,document_date:scope.kind==='enrollment'?'2026-11-19':null,effective_admission_date:scope.kind==='enrollment'?'2026-11-19':null,timezone:'Europe/Moscow',sources:{enabled:'default',document_date:'enrollment_event',effective_admission_date:'enrollment_event'},policy_revisions:{organization:0,group:0,enrollment:0}},
 groups:scope.kind==='enrollment'?[{id:ids.group,name:'QA группа'}]:[],draft:null,individual_date_overrides:scope.kind==='group'?0:null,
 capabilities:{can_read:true,can_write:true,can_prepare:scope.kind==='enrollment',can_apply_current:scope.kind!=='enrollment'},
});
export const draft=():any=>({id:ids.draft,organization_id:ids.org,enrollment_id:ids.enrollment,user_id:ids.learner,course_id:ids.course,observed_group_id:ids.group,group_id:ids.group,revision:1,document_date:'2026-11-19',effective_admission_date:'2026-11-18',recorded_at:'2026-11-19T01:00:00Z',updated_at:'2026-11-19T01:00:00Z',status:'needs_information',preparation_mode:'automatic',missing_facts:['program_not_confirmed'],source_revision:1,program_ref:null,policy_revisions:{organization:0,group:0,enrollment:0},stale:false,registered_locked:false,live_missing_facts:['program_not_confirmed']});
export const exported=():any=>({schema_version:1,organization_id:ids.org,enrollment_id:ids.enrollment,draft_id:ids.draft,revision:1,document_date:'2026-11-19',effective_admission_date:'2026-11-18',recorded_at:'2026-11-19T01:00:00Z',status:'needs_information',missing_facts:['program_not_confirmed'],organization_name:'QA организация',student_name:'Ученик',course_title:'Курс',group_name:'QA группа',program_title:null});
