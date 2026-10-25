import { initialQuizData, type QuizData } from '@/hooks/useSelfExaminationQuiz';
import { emptySelfExaminationDraft, validateSelfExaminationDraft, type SelfExaminationDraftInput } from '../../../supabase/functions/_shared/self-examination-workflow-contract';
import { selfExaminationPeriod } from '../../../supabase/functions/_shared/self-examination-policy';
/** Dates are derived from an explicitly selected calendar year, never upload/current dates. */
export function quizAnswers(data: QuizData): Record<string, unknown> {
 const { periodStart: _start, periodEnd: _end, ...answers } = data;
 return answers;
}
export function quizFromDraft(body: SelfExaminationDraftInput): QuizData {
 const period=selfExaminationPeriod(body.reporting_year),a=body.answers;
 const result={...initialQuizData,...a,periodStart:period.from,periodEnd:period.to} as QuizData;
 for(const key of Object.keys(initialQuizData) as (keyof QuizData)[]){
  if(key!=='periodStart'&&key!=='periodEnd'&&a[key]==null && typeof initialQuizData[key]==='string') (result as any)[key]='';
 }
 for(const key of ['programTypes','controlTypes','commissionMembers','programs','staff'] as const){if(!Array.isArray(result[key]))(result as any)[key]=[];}
 if(!result.commissionChairman)result.commissionChairman={fio:'',position:''};
 return result;
}
export function composeSelfExaminationDraft(year:number,data:QuizData,metadata?:SelfExaminationDraftInput):SelfExaminationDraftInput {
 return validateSelfExaminationDraft({...metadata??emptySelfExaminationDraft(year),reporting_year:year,answers:quizAnswers(data)});
}
export function selfExaminationOrderReference(draft:{id:string;revision:number;reporting_year:number;fact_hash:string;organization_id:string}){
 return {schema_version:1,kind:'self_examination_draft',draft_id:draft.id,organization_id:draft.organization_id,reporting_year:draft.reporting_year,revision:draft.revision,fact_hash:draft.fact_hash};
}

export type SelfExaminationOrderReference=ReturnType<typeof selfExaminationOrderReference>;
