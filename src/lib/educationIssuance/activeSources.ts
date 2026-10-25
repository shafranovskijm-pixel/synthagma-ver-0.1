import { loadIssuanceExport } from './export.ts';
import { EducationIssuanceError, requireIssuanceScope, type EducationIssuanceScope } from './client.ts';
import type { IssuanceRecord } from './types.ts';
export type ActiveIssuanceSource={kind:'confirmed';record:IssuanceRecord}|{kind:'unavailable';reason:'NOT_ISSUED'|'ANNULLED_ONLY'|'AMBIGUOUS'|'LEGACY_UNVERIFIED'};
export function selectActiveIssuanceSources(records:IssuanceRecord[],assignments:{enrollmentId:string;courseId:string;userId:string}[],missing:{enrollment_id:string;code:string}[]=[]):Map<string,ActiveIssuanceSource>{
 const result=new Map<string,ActiveIssuanceSource>();
 for(const assignment of assignments){
  const rows=records.filter(row=>row.official.enrollment_id===assignment.enrollmentId);
  if(rows.some(row=>row.official.course_id!==assignment.courseId||row.official.user_id!==assignment.userId))throw new EducationIssuanceError('SOURCE_CHANGED');
  const active=rows.filter(row=>row.lifecycle==='active'&&row.official.deleted_at===null);
  result.set(assignment.enrollmentId,active.length>1?{kind:'unavailable',reason:'AMBIGUOUS'}:!active.length?{kind:'unavailable',reason:rows.some(row=>row.lifecycle==='annulled')||missing.some(row=>row.enrollment_id===assignment.enrollmentId&&row.code==='ANNULLED_ONLY')?'ANNULLED_ONLY':'NOT_ISSUED'}:active[0].provenance!=='controlled_issuance'?{kind:'unavailable',reason:'LEGACY_UNVERIFIED'}:{kind:'confirmed',record:active[0]});
 }
 return result;
}
/** Exact caller-authorized read only. Never chooses an arbitrary latest original/duplicate. */
export async function readActiveIssuanceSources(scope:EducationIssuanceScope,assignments:{enrollmentId:string;courseId:string;userId:string}[]){
 requireIssuanceScope(scope);
 if(!assignments.length||assignments.length>1000||new Set(assignments.map(row=>row.enrollmentId)).size!==assignments.length)throw new EducationIssuanceError('INVALID_INPUT');
 const records:IssuanceRecord[]=[],missing:{enrollment_id:string;code:string}[]=[],courses=[...new Set(assignments.map(row=>row.courseId))];
 for(const courseId of courses){
  const {snapshot}=await loadIssuanceExport(scope,{kind:'export',selection:{kind:'enrollments',course_id:courseId,enrollment_ids:assignments.filter(row=>row.courseId===courseId).map(row=>row.enrollmentId)},format:'canonical_snapshot'});
  records.push(...snapshot.records);missing.push(...snapshot.missing);requireIssuanceScope(scope);
 }
 return selectActiveIssuanceSources(records,assignments,missing);
}
export const activeSourceMessages:Record<Extract<ActiveIssuanceSource,{kind:'unavailable'}>['reason'],string>={
 NOT_ISSUED:'Документ ещё не выдан',ANNULLED_ONLY:'Есть только аннулированные документы',AMBIGUOUS:'Есть несколько действующих записей: оригинал, дубликат или прежняя запись. Нужен явный выбор в журнале',LEGACY_UNVERIFIED:'Прежняя запись не имеет проверяемого основания выдачи',
};
