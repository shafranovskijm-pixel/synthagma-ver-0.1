import type { IssuanceCapabilities, IssuanceMutation, WithdrawalBasis, WithdrawalState } from '../types.ts';
export const uid=(n:number)=>"00000000-0000-4000-8000-"+n.toString().padStart(12,"0");
export const actor=uid(1),org=uid(2),group=uid(3),course=uid(4),pupil=uid(5),enrollment=uid(6),request=uid(7);
export const hash="a".repeat(64),stamp="2026-10-22T10:00:00Z";
export const caps:IssuanceCapabilities={can_read:true,can_issue:true,can_write_metadata:true,can_record_handover:true,can_annul:true,can_issue_duplicate:true,can_export:true,can_read_withdrawal:true,can_withdraw:true};
export const source={kind:"org_document_version" as const,document_id:uid(8),version_id:uid(9),content_hash:hash};
export const basis:WithdrawalBasis={kind:"learner_request",source,provision:"Заявление №1",reason:"Фактическое заявление ученика"};
export function withdrawal(state:"active"|"withdrawn"="active"):WithdrawalState{
  return {ref:{organization_id:org,enrollment_id:enrollment,user_id:pupil,course_id:course,group_id:group,revision:state==="active"?0:1,source_hash:hash},
    state,effective_date:state==="active"?null:"2026-10-22",recorded_at:state==="active"?null:stamp,recorded_by:state==="active"?null:actor,
    basis:state==="active"?null:{...basis,source_availability:"available"},technical_status:"completed",technical_progress:100,technical_completed_at:stamp,
    technical_time_spent:3600,manual_credit_retained:true,original_record_ids:[],can_withdraw:state==="active"};
}
export function withdrawalAction(){return {action:"withdraw_enrollments" as const,intent:{enrollment_ids:[enrollment],effective_date:"2026-10-22",basis},preview_hash:hash,items:[withdrawal().ref],reason:basis.reason};}
export function mutation(replayed=false):IssuanceMutation{return {schema_version:1,organization_id:org,scope:{kind:"organization"},capabilities:caps,
  receipt:{request_id:request,action:"withdraw_enrollments",scope_hash:hash,payload_hash:hash,record_ids:[],enrollment_ids:[enrollment],event_ids:[uid(10)],applied_at:stamp,replayed},
  records:[],withdrawals:[withdrawal("withdrawn")]};}

import type { IssuancePreparation } from '../types.ts';
export function eligibility(){
  const association={organization_id:org,group_id:group,enrollment_id:enrollment,user_id:pupil,course_id:course};
  const program_ref={enrollment_snapshot_id:uid(20),binding_id:uid(21),binding_revision:1,version_id:uid(22),snapshot_hash:hash,facts_hash:hash,file_document_id:uid(23),file_version_id:uid(24),file_review_id:uid(25)};
  return {...association,program_ref,outcome_ref:{scope:{...association,program_enrollment_snapshot_id:program_ref.enrollment_snapshot_id,program_version_id:program_ref.version_id},revision:1,
    criteria_ref:{id:uid(26),revision:1,content_hash:hash,approved_at:stamp},machine_result_id:uid(27),machine_input_hash:hash,decision_id:uid(28),decision_basis:"machine" as const,source_hash:hash},
    admission_ref:{case_id:uid(29),scope:association,revision:3,decision_event_id:uid(30),decision_case_revision:3,program_ref,rule_set_id:uid(31),rule_set_digest:hash,requirements_digest:hash,evidence_refs:[],final_education_proof:null,source_hash:hash},
    identity_ref:{user_id:pupil,registration_hash:hash,source:"current_student_registration" as const},withdrawal_revision:0,source_hash:hash};
}
export const template={source,review_id:uid(40),review_revision:1};
export function preparation(status:IssuancePreparation["items"][number]["status"]="prepared"):IssuancePreparation{
  const plan={kind:"original" as const,intent:{course_id:course,enrollment_ids:[enrollment],issue_date:"2026-10-22",document_series:null},preview_hash:hash,
    items:[{enrollment_id:enrollment,expected_eligibility_ref:eligibility()}],template,reason:"Проверенный итоговый документ по решению ответственного"};
  const artifact=status==="prepared"?null:{source:{...source,document_id:uid(41),version_id:uid(42)},byte_sha256:hash,byte_size:500,render_input_hash:hash,
    template_byte_sha256:hash,html_sha256:hash,renderer:"browserless" as const,renderer_revision:"uc019-v1" as const,
    output_review:status==="approved_unissued"||status==="consumed"?{id:uid(43),revision:1}:null};
  return structuredClone({id:uid(50),organization_id:org,scope:{kind:"organization"},kind:"original",created_at:stamp,created_by:actor,intent_hash:hash,template,plan,
    items:[{id:uid(51),enrollment_id:enrollment,user_id:pupil,course_id:course,group_id:group,input_revision:1,status,number_plan:{state:"prospective_unreserved",document_number:"1",reg_number:"1",document_series:null,issue_date:"2026-10-22"},
      render_input_hash:hash,artifact,final_record_id:status==="consumed"?uid(52):null}]});
}

export function issuedRecord():import('../types.ts').IssuanceRecord {
  const prep=preparation('approved_unissued'),item=prep.items[0],artifact=item.artifact!,review=artifact.output_review!;
  const {output_review,...captured}=artifact;
  return {official:{id:uid(52),organization_id:org,enrollment_id:enrollment,user_id:pupil,course_id:course,group_id:group,reg_number:'1',document_number:'1',document_series:null,
    document_type:'qualification',document_status:'original',full_name:'Иванов Иван Иванович',birth_date:'1990-01-01',issue_date:'2026-10-22',specialty_name:'Синтетическая программа',qualification_name:'Квалификация',
    protocol_number:null,protocol_date:null,order_number:null,order_date:null,education_result:null,created_at:stamp,updated_at:stamp,deleted_at:null,notes:null,delivery_method:'not_recorded',delivery_details:null,original_document_data:null},
    revision:1,state_hash:hash,provenance:'controlled_issuance',lifecycle:'active',original_record_id:null,
    artifact:{availability:'available',artifact:{preparation_id:prep.id,item_id:item.id,input_revision:item.input_revision,...captured,output_review_id:review.id,output_review_revision:review.revision}},
    frdo_facts:{schema_version:1,source:'issuance_preparation_snapshot',last_name:'Иванов',first_name:'Иван',middle_name:'Иванович',birth_date:'1990-01-01',program_title:'Синтетическая программа',program_type:'professional_training',academic_hours:72,qualification_name:'Квалификация',profession:null,
      training_start_date:null,training_end_date:null,document_type:'qualification',document_series:null,document_number:'1',reg_number:'1',issue_date:'2026-10-22',missing:['TRAINING_START_DATE','TRAINING_END_DATE']},
    proof:eligibility(),proof_availability:'captured',notes:'',latest_handover:null,annulment:null,capabilities:caps};
}
export function issueAction(){const prep=preparation('approved_unissued');return {action:'issue_batch' as const,intent:prep.plan.kind==='original'?prep.plan.intent:neverOriginal(),preview_hash:hash,
  items:[{enrollment_id:enrollment,expected_eligibility_ref:eligibility(),artifact:issuedRecord().artifact.artifact!}],reason:'Сверен точный итоговый файл'};}
function neverOriginal():never {throw Error('Fixture must be an original plan');}
export function issueMutation(replayed=false):IssuanceMutation{return {schema_version:1,organization_id:org,scope:{kind:'organization'},capabilities:caps,
  receipt:{request_id:request,action:'issue_batch',scope_hash:hash,payload_hash:hash,record_ids:[uid(52)],enrollment_ids:[enrollment],event_ids:[uid(53)],applied_at:stamp,replayed},records:[issuedRecord()],withdrawals:[]};}
