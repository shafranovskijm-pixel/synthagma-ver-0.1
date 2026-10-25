import { validateSelfExaminationDraft, type SelfExaminationDraftInput } from './self-examination-workflow-contract.ts';
import { SELF_EXAMINATION_SECTIONS, SELF_EXAMINATION_LEGAL_REFERENCES } from './self-examination-catalog.ts';
import { selfExaminationFactLabel, SELF_EXAMINATION_ANSWER_LABELS } from './self-examination-labels.ts';
import type { SelfExaminationDraftInput as RenderInput, SelfExaminationFact as RenderFact } from './self-examination-renderer.ts';
export interface CapturedSelfExaminationFact {fact_key:string;state:'unknown'|'entered'|'confirmed'|'not_applicable';value:unknown;value_hash:string;required:boolean;source_current:boolean;source:unknown;location:string|null;review_note:string|null;confirmed_by:string|null;confirmed_at:string|null}
export interface SelfExaminationGenerationCapture {generation_id:string;reporting_year:number;body:SelfExaminationDraftInput;fact_reviews:Record<string,unknown>;facts:CapturedSelfExaminationFact[];fact_hash:string;order_id:string|null;document_id:string;expected_document_revision:number;prepared_by:string;prepared_at:string}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/;
const privateLocator=/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|file:\/\/|(?:^|\s)[a-z]:[\\/]|sb-storage\/|storage\/v1\/|object\/(?:sign|authenticated)\/|(?:org-documents|signed-documents|external-contracts)\/|[?&](?:token|access_token|signature|authorization|api[_-]?key)=|\bBearer\s|\beyJ[\w-]+\.[\w-]+\.[\w-]+)/i;
export const selfExaminationPublicText=(text:string|null)=>text===null?null:privateLocator.test(text)?'Сведения доступны в защищённом кабинете центра':text;
export function parseSelfExaminationCapture(value:unknown):SelfExaminationGenerationCapture{
 if(!object(value)||!uuid.test(String(value.generation_id))||!uuid.test(String(value.document_id))||!uuid.test(String(value.prepared_by))||!(value.order_id===null||uuid.test(String(value.order_id)))||!hash.test(String(value.fact_hash))||!Number.isSafeInteger(value.expected_document_revision)||Number(value.expected_document_revision)<0||typeof value.prepared_at!=='string'||!Number.isFinite(Date.parse(value.prepared_at))||!object(value.fact_reviews)||!Array.isArray(value.facts)||value.facts.length>500)throw Error('INVALID_SELF_EXAMINATION_CAPTURE');
 const body=validateSelfExaminationDraft(value.body);if(body.reporting_year!==value.reporting_year)throw Error('INVALID_SELF_EXAMINATION_CAPTURE');const seen=new Set<string>();
 for(const f of value.facts){if(!object(f)||typeof f.fact_key!=='string'||f.fact_key.length>220||seen.has(f.fact_key)||!['unknown','entered','confirmed','not_applicable'].includes(String(f.state))||!hash.test(String(f.value_hash))||typeof f.required!=='boolean'||typeof f.source_current!=='boolean'||!(f.location===null||typeof f.location==='string')||!(f.review_note===null||typeof f.review_note==='string'))throw Error('INVALID_SELF_EXAMINATION_CAPTURE');seen.add(f.fact_key);}
 return {...value,body}as unknown as SelfExaminationGenerationCapture;
}
function printable(value:unknown,depth=0):string|number|boolean|null {
 if(value===null||typeof value==='number'||typeof value==='boolean')return value as null|number|boolean;
 if(typeof value==='string')return selfExaminationPublicText(value);
 if(depth>6)return'Структура требует проверки';
 if(Array.isArray(value))return value.length?value.map(row=>printable(row,depth+1)??'Не указано').join('; '):'Перечень не заполнен';
 if(object(value))return Object.entries(value).map(([key,item])=>(SELF_EXAMINATION_ANSWER_LABELS[key]??({fio:'ФИО',position:'Должность',name:'Наименование',type:'Вид',studentsCount:'Обучающихся',subject:'Дисциплина',education:'Образование',experienceYears:'Стаж',employmentType:'Занятость',provider_kind:'Вид организации',indicator_profile:'Перечень показателей',legal_basis_note:'Основание',from:'Начало',to:'Окончание'}as Record<string,string>)[key]??'Значение')+': '+(printable(item,depth+1)??'Не указано')).join('; ');
 return null;
}
export function projectSelfExaminationCapture(value:unknown):RenderInput{
 const capture=parseSelfExaminationCapture(value),body=capture.body;
 const complete=(key:string)=>capture.facts.find(f=>f.fact_key===key&&f.state==='confirmed'&&f.source_current);
 const title=complete('answer:fullName'),legal=complete('legal_scope');
 const providers={undetermined:'Вид организации требует подтверждения',dpo_organization:'Образовательная организация ДПО',other_educational_organization:'Другая образовательная организация',other_training_provider:'Другой учебный центр'};
 const facts:RenderFact[]=capture.facts.filter(f=>!f.fact_key.startsWith('indicator:')).map(f=>({key:f.fact_key,label:selfExaminationFactLabel(f.fact_key),section:f.fact_key.startsWith('section:')?SELF_EXAMINATION_SECTIONS.find(([key])=>key===f.fact_key.slice(8))?.[1]??'Аналитическая часть':'Сведения центра',unit:null,state:f.state,value:printable(f.value),sourceCurrent:f.source_current,location:selfExaminationPublicText(f.location),reviewNote:selfExaminationPublicText(f.review_note)}));
 const indicators:RenderFact[]=body.indicators.map(row=>{const f=capture.facts.find(f=>f.fact_key==='indicator:'+row.code);return{key:'indicator:'+row.code,label:row.label,section:'Показатели деятельности',unit:row.unit,state:f?.state??'unknown',value:typeof row.value==='object'&&row.value?{...row.value,undefined_share_reason:selfExaminationPublicText(row.value.undefined_share_reason)}:row.value,sourceCurrent:f?.source_current??false,location:selfExaminationPublicText(f?.location??null),reviewNote:selfExaminationPublicText(f?.review_note??null)};});
 return{organizationTitle:title&&typeof title.value==='string'?selfExaminationPublicText(title.value)!:'Наименование требует подтверждения',reportingYear:capture.reporting_year,providerLabel:legal?providers[body.provider_kind]:'Применимость требует подтверждения',legalBasisNote:legal?selfExaminationPublicText(body.legal_basis_note):null,facts,indicators,legalReferences:Object.values(SELF_EXAMINATION_LEGAL_REFERENCES).map(({title,url})=>({title,url})),generatedAt:capture.prepared_at};
}
