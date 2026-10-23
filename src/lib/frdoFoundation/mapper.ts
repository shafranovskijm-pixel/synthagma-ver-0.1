import * as c from './contract';
import {OFFICIAL_TEMPLATES} from './officialMetadata';
import {nativeMember,verifyNativeDictionaries} from './dictionaries';
import {BOUNDS,canonicalJson,deepFreeze,ensureCurrent,refuse,sha256} from './hash';
import type {CurrentGuard,FoundationContext,FoundationInput,Issue,MappingEntry,MappedBatch,OfficialCell,Row,Stream,Supplement,SupplementFields,FrozenFrdoFacts} from './types';
const general=/^[A-Za-zА-Яа-яЁё0-9. /-]+$/;
const namePattern=/^[А-Яа-яЁё.\u0027\u0060 ()-]+$/;
const programme=/^[A-Za-zА-Яа-яЁё0-9()./\- ,:«»"?№&+#_;]+$/;
const qualification=/^[A-Za-zА-Яа-яЁё0-9(). \-:;,/«»]+$/;
const regDpo=/^[A-Za-zА-Яа-яЁё0-9()./\- ]+$/,regPo=/^[A-Za-zА-Яа-яЁё0-9№()./\- _]+$/;
const originalRegDpo=/^[A-Za-zА-Яа-яЁё0-9./\- _]+$/,originalRegPo=/^[A-Za-zА-Яа-яЁё0-9()./\- _]+$/;
const messages:Record<string,string>={LEGACY_UNCONFIRMED:'Историческая запись не содержит подтверждённого снимка выдачи.',ANNULLED:'Выбранный документ аннулирован.',SOURCE_CHANGED:'Снимок или подтверждённые дополнительные сведения не совпадают.',SOURCE_UNAVAILABLE:'Текущие доказательства или исходная версия недоступны.',ORIGINAL_UNCONFIRMED:'Нужен точный подтверждённый оригинал дубликата.',SUBJECT_MISMATCH:'Оригинал относится к другому назначению или получателю.',UNSUPPORTED_DOCUMENT:'Этот вид документа не поддерживается данным шаблоном.',MISSING_REQUIRED:'Не хватает явно проверенного значения обязательного поля.',INVALID_ENUM:'Значение отсутствует в закреплённом официальном справочнике.',INVALID_DATE:'Дата или последовательность дат не соответствует правилам шаблона.',INVALID_NAME:'Имя содержит недопустимые символы или пробелы.',INVALID_NUMBER:'Реквизит не соответствует формату официального шаблона.',INVALID_SNILS:'СНИЛС не прошёл проверку формата и контрольного числа.',EXTERNAL_SNILS_ROUTE_REQUIRED:'Для отсутствующего СНИЛС нужен предусмотренный ФИС отдельный маршрут через поддержку.',FIELD_TOO_LONG:'Поле превышает длину официального шаблона; значение не сокращалось.',PROGRAMME_CONFLICT:'Вид программы и документа или проверенные сведения противоречат друг другу.',DUPLICATE_EXTERNAL_OPERATION_REQUIRED:'Перед передачей дубликата отдельно подтвердите предусмотренную ФИС операцию с оригиналом.',LEGAL_POLICY_UNVERIFIED:'Полная текущая правовая редакция и применимый порядок сроков ещё не утверждены.',UNSUPPORTED_ISSUER_REGIME:'Совместный или неподтверждённый режим организации не поддерживается этим стандартным экспортом.'};
function issue(context:FoundationContext,rule:string|null,code:Issue['code'],severity:Issue['severity']='blocker'):Issue{
 const column=rule?OFFICIAL_TEMPLATES[context.stream].columns.find(value=>value.rule===rule):null;
 const next=code==='EXTERNAL_SNILS_ROUTE_REQUIRED'?'contact_fis_support':code==='DUPLICATE_EXTERNAL_OPERATION_REQUIRED'?'review_external_operation':code==='LEGAL_POLICY_UNVERIFIED'||code==='UNSUPPORTED_ISSUER_REGIME'?'review_legal_policy':code==='ORIGINAL_UNCONFIRMED'?'review_original':code==='SOURCE_CHANGED'||code==='SOURCE_UNAVAILABLE'?'refresh_preview':'review_supplement';
 return {code,severity,column_index:column?.index??null,field:rule,message:messages[code]??'Проверьте выбранные подтверждённые сведения.',next_action:next};
}
export function excel1900Date(value:string):number{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')return refuse('INVALID_REQUEST');
 const at=Date.parse(value+'T00:00:00.000Z');if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==value)return refuse('INVALID_REQUEST');
 return (at-Date.parse('1899-12-31T00:00:00.000Z'))/86400000+(value>='1900-03-01'?1:0);
}
export function validSnils(value:string):boolean{
 if(!/^\d{11}$/.test(value)||/^0{11}$/.test(value)||/^(\d)\1{10}$/.test(value))return false;
 const sum=[...value.slice(0,9)].reduce((n,v,i)=>n+Number(v)*(9-i),0),check=sum<100?sum:sum===100||sum===101?0:sum%101===100?0:sum%101;
 return check===Number(value.slice(9));
}
function factsConsistent(record:MappingEntry['record']):boolean{
 const f=record.frdo_facts,o=record.official;if(!f)return false;
 const expected=f.program_type==='professional_training'?'qualification':f.program_type==='dpo_retraining'?'diploma':'certificate';
 const missing=([['LAST_NAME',f.last_name],['FIRST_NAME',f.first_name],['BIRTH_DATE',f.birth_date],['TRAINING_START_DATE',f.training_start_date],['TRAINING_END_DATE',f.training_end_date]]as const).filter(([,value])=>!value?.trim()).map(([key])=>key).sort();
 return f.document_type===expected&&f.document_type===o.document_type&&f.document_series===o.document_series&&f.document_number===o.document_number&&f.reg_number===o.reg_number&&f.issue_date===o.issue_date&&f.birth_date===o.birth_date&&f.program_title===o.specialty_name&&canonicalJson([...f.missing].sort())===canonicalJson(missing);
}
function proofValue(projection:Supplement['evidence'][number]){if(projection.availability!=='available'||!projection.evidence)return refuse('SOURCE_UNAVAILABLE');return projection.evidence;}
/** The supplement facts digest deliberately excludes nullable reviewer attribution and
 * mutable display notes. Privacy removal of an attributed reviewer does not rewrite
 * the immutable subject facts domain. Future persistence must use this exact domain. */
export function supplementFactsDomain(organizationId:string,value:Supplement){
 const fields=structuredClone(value.fields),exception=fields.snils_exception;
 const inputFields=exception.kind==='none'?fields:{...fields,snils_exception:{...exception,not_assigned_confirmation:proofValue(exception.not_assigned_confirmation),approval_evidence:proofValue(exception.approval_evidence)}};
 return {schema_version:1,organization_id:organizationId,record_id:value.record_id,user_id:value.user_id,frozen_facts_sha256:value.ref.frozen_facts_sha256,revision:value.ref.revision,fields:inputFields,evidence:value.evidence.map(proofValue)};
}
async function checkedSupplement(context:FoundationContext,record:MappingEntry['record'],value:Supplement|null,factsSha:string,guard:CurrentGuard,problems:Issue[]):Promise<SupplementFields|null>{
 if(!value){problems.push(issue(context,null,'MISSING_REQUIRED'));return null;}
 if(value.record_id!==record.official.id||value.user_id!==record.official.user_id||value.ref.frozen_facts_sha256!==factsSha){problems.push(issue(context,null,'SOURCE_CHANGED'));return null;}
 if(!value.evidence.length){problems.push(issue(context,null,'SOURCE_UNAVAILABLE'));return null;}
 let payload:unknown;try{payload=supplementFactsDomain(context.organization_id,value);}catch{problems.push(issue(context,null,'SOURCE_UNAVAILABLE'));return null;}
 const actual=await sha256(canonicalJson(payload));ensureCurrent(guard);if(actual!==value.ref.snapshot_sha256){problems.push(issue(context,null,'SOURCE_CHANGED'));return null;}return value.fields;
}
function documentLabel(f:FrozenFrdoFacts,stream:Stream):string|null{
 if(stream==='dpo'&&f.document_type==='certificate'&&f.program_type==='dpo_upskilling')return 'Удостоверение о повышении квалификации';
 if(stream==='dpo'&&f.document_type==='diploma'&&f.program_type==='dpo_retraining')return 'Диплом о профессиональной переподготовке';
 if(stream==='po'&&f.document_type==='qualification'&&f.program_type==='professional_training')return 'Свидетельство о профессии рабочего, должности служащего';return null;
}
type FactKey=Exclude<keyof SupplementFields,'snils_exception'|'training_period'>;
function fact(fields:SupplementFields|null,key:FactKey):string|boolean|null{const value=fields?.[key]as {state?:string;value?:unknown}|undefined;return value?.state==='known'&&(typeof value.value==='string'||typeof value.value==='boolean')?value.value:null;}
async function mapOne(context:FoundationContext,entry:MappingEntry,guard:CurrentGuard):Promise<{row:Row|null;issues:Issue[]}>{
 ensureCurrent(guard);const r=entry.record,o=r.official,problems:Issue[]=[];
 if(o.organization_id!==context.organization_id||context.scope.kind==='group'&&o.group_id!==context.scope.group_id||!r.capabilities.can_read||!r.capabilities.can_export)return refuse('ACCESS_DENIED');
 if(r.provenance!=='controlled_issuance'||!r.frdo_facts||!o.user_id||!o.enrollment_id||!o.course_id)return {row:null,issues:[issue(context,null,'LEGACY_UNCONFIRMED')]};
 if(!factsConsistent(r))return {row:null,issues:[issue(context,null,'SOURCE_CHANGED')]};
 const f=r.frdo_facts,factsSha=await sha256(canonicalJson(f));ensureCurrent(guard);
 if(r.lifecycle==='annulled')problems.push(issue(context,null,'ANNULLED'));
 if(o.deleted_at!==null||r.proof_availability!=='captured'||r.artifact.availability!=='available')problems.push(issue(context,null,'SOURCE_UNAVAILABLE'));
 if(context.issuer_regime!=='ordinary_rf')problems.push(issue(context,null,'UNSUPPORTED_ISSUER_REGIME'));
 const fields=await checkedSupplement(context,r,entry.supplement,factsSha,guard,problems);
 let original:MappingEntry['record']|null=null,originalFields:SupplementFields|null=null;
 if(o.document_status==='duplicate'){
  const candidate=entry.original;
  if(candidate&&(candidate.official.organization_id!==context.organization_id||!candidate.capabilities.can_read||!candidate.capabilities.can_export))return refuse('ACCESS_DENIED');
  if(!r.original_record_id||!candidate||candidate.official.id!==r.original_record_id||candidate.provenance!=='controlled_issuance'||!candidate.frdo_facts||!factsConsistent(candidate)||candidate.official.document_status!=='original')problems.push(issue(context,null,'ORIGINAL_UNCONFIRMED'));
  else if(candidate.official.user_id!==o.user_id||candidate.official.enrollment_id!==o.enrollment_id||candidate.official.course_id!==o.course_id||candidate.official.group_id!==o.group_id)problems.push(issue(context,null,'SUBJECT_MISMATCH'));
  else{original=candidate;if(original.official.deleted_at!==null||original.proof_availability!=='captured'||original.artifact.availability!=='available')problems.push(issue(context,null,'SOURCE_UNAVAILABLE'));const originalSha=await sha256(canonicalJson(original.frdo_facts));ensureCurrent(guard);originalFields=await checkedSupplement(context,original,entry.original_supplement,originalSha,guard,problems);}
  problems.push(issue(context,null,'DUPLICATE_EXTERNAL_OPERATION_REQUIRED','warning'));
 }else if(r.original_record_id!==null||entry.original!==null||entry.original_supplement!==null)problems.push(issue(context,null,'SOURCE_CHANGED'));
 const originalFacts=original?.frdo_facts??null;
 const add=(rule:string,code:Issue['code'])=>problems.push(issue(context,rule,code));
 const text=(rule:string,value:unknown,max:number,pattern:RegExp,required=true):OfficialCell=>{if(value===null||value===undefined){if(required)add(rule,'MISSING_REQUIRED');return null;}if(typeof value!=='string'||!value.length||!pattern.test(value)){add(rule,rule.includes('name')||rule.includes('last')||rule.includes('first')||rule.includes('middle')?'INVALID_NAME':'INVALID_NUMBER');return null;}if(value.length>max){add(rule,'FIELD_TOO_LONG');return null;}return value;};
 const named=(rule:string,value:unknown,max=50,required=true)=>{const result=text(rule,value,max,namePattern,required);if(typeof result==='string'&&(/^[ -]|[ -]$|[ -]{2}/.test(result))){add(rule,'INVALID_NAME');return null;}return result;};
 const dictionary=(rule:string,name:string,value:unknown,required:boolean):OfficialCell=>{if(value===null||value===undefined){if(required)add(rule,'MISSING_REQUIRED');return null;}if(typeof value!=='string'||!nativeMember(context.stream,name,value)){add(rule,'INVALID_ENUM');return null;}return value;};
 const absentText=(rule:string,value:string|null,source:SupplementFields|null,key:'series_absence'|'patronymic_absence'|'qualification_not_awarded',max:number,pattern:RegExp):OfficialCell=>{const confirmed=fact(source,key)===true;if(value!==null&&confirmed){add(rule,'SOURCE_CHANGED');return null;}return text(rule,value??(confirmed?'Нет':null),max,pattern);};
 const dateCell=(rule:string,value:string|null,latest:string):OfficialCell=>{if(value===null){add(rule,'MISSING_REQUIRED');return null;}try{if(value>latest){add(rule,'INVALID_DATE');return null;}return excel1900Date(value);}catch{add(rule,'INVALID_DATE');return null;}};
 // The immutable K facts and facts digest are never rewritten. An explicitly reviewed, versioned actual-period supplement is a separate sourced fact.
 const period=fields?.training_period;
 if(period&&(period.evidence_index>=((entry.supplement?.evidence.length)??0)||period.start_date>period.end_date||period.end_date>f.issue_date))add('start_year','INVALID_DATE');
 if(period&&(f.training_start_date!==null&&f.training_start_date!==period.start_date||f.training_end_date!==null&&f.training_end_date!==period.end_date))add('start_year','SOURCE_CHANGED');
 const start=f.training_start_date??period?.start_date??null,end=f.training_end_date??period?.end_date??null,minimum=o.document_status==='duplicate'?1955:1978;
 const year=(rule:string,value:string|null):OfficialCell=>{if(value===null){add(rule,'MISSING_REQUIRED');return null;}const y=Number(value.slice(0,4));if(y<minimum||y>Number(context.as_of_date.slice(0,4))||value>f.issue_date||end!==null&&start!==null&&end<start){add(rule,'INVALID_DATE');return null;}return y;};
 const requiredLater=f.issue_date>='2021-01-01';
 const citizenship=fact(fields,'citizenship_code');
 const snils=():OfficialCell=>{const value=fact(fields,'snils');if(typeof value==='string'){if(!validSnils(value)){add('snils','INVALID_SNILS');return null;}return value.slice(0,3)+'-'+value.slice(3,6)+'-'+value.slice(6,9)+' '+value.slice(9);}if(citizenship==='643'&&requiredLater)add('snils','EXTERNAL_SNILS_ROUTE_REQUIRED');return null;};
 const mapped:Record<string,()=>OfficialCell>={
  document_type:()=>{const value=documentLabel(f,context.stream);if(!value)add('document_type','UNSUPPORTED_DOCUMENT');return value;},document_status:()=>o.document_status==='original'?'Оригинал':'Дубликат',
  loss:()=>dictionary('loss',context.stream==='dpo'?'спУтраты':'утратаа',fact(fields,'loss_confirmation'),true),exchange:()=>dictionary('exchange',context.stream==='dpo'?'спОбмена':'Ообмен',fact(fields,'exchange_confirmation'),true),destruction:()=>dictionary('destruction',context.stream==='dpo'?'спУничтожения':'унич',fact(fields,'destruction_confirmation'),true),
  series:()=>absentText('series',f.document_series,fields,'series_absence',20,general),number:()=>text('number',f.document_number,40,general),issue_date:()=>dateCell('issue_date',f.issue_date,context.as_of_date),reg_number:()=>text('reg_number',f.reg_number,30,context.stream==='dpo'?regDpo:regPo),
  program_type_dpo:()=>f.program_type==='dpo_upskilling'?'Повышение квалификации':f.program_type==='dpo_retraining'?'Профессиональная переподготовка':(add('program_type_dpo','PROGRAMME_CONFLICT'),null),
  program_type_po:()=>dictionary('program_type_po','проф',fact(fields,'po_program_subtype'),false),title_dpo:()=>text('title_dpo',f.program_title,600,programme),title_po:()=>text('title_po',f.program_title,255,programme),
  professional_area:()=>dictionary('professional_area','спОбластьПрофДеятельности',fact(fields,'professional_area'),false),specialty_group:()=>dictionary('specialty_group','спУкрГрСпец',fact(fields,'specialty_group'),false),qualification:()=>absentText('qualification',f.qualification_name,fields,'qualification_not_awarded',500,qualification),
  prior_education:()=>dictionary('prior_education','спУровеньОбразования',fact(fields,'prior_education_level'),false),prior_last_name:()=>named('prior_last_name',fact(fields,'prior_diploma_last_name'),50,false),prior_series:()=>text('prior_series',fact(fields,'prior_diploma_series'),20,general,false),prior_number:()=>text('prior_number',fact(fields,'prior_diploma_number'),40,general,false),
  start_year:()=>year('start_year',start),end_year:()=>year('end_year',end),hours_dpo:()=>f.academic_hours,hours_po:()=>f.academic_hours>=6?f.academic_hours:(add('hours_po','PROGRAMME_CONFLICT'),null),
  profession:()=>dictionary('profession','Квалиф',f.profession,true),rank:()=>dictionary('rank','Класс1',fields?.qualification_rank.state==='confirmed_absent'?'Нет':fact(fields,'qualification_rank'),false),
  last_name:()=>named('last_name',f.last_name),first_name:()=>named('first_name',f.first_name),middle_name:()=>{const value=absentText('middle_name',f.middle_name,fields,'patronymic_absence',50,namePattern);return typeof value==='string'?named('middle_name',value):null;},birth_date:()=>dateCell('birth_date',f.birth_date,f.issue_date),
  gender:()=>dictionary('gender',context.stream==='dpo'?'Пол':'пол',fact(fields,'gender'),true),snils,
  training_form:()=>dictionary('training_form',context.stream==='dpo'?'спФормаОбучения':'ФО',fact(fields,'training_form'),requiredLater),financing:()=>dictionary('financing',context.stream==='dpo'?'спИстФинан':'финансирование',fact(fields,'financing_source'),requiredLater),education_form:()=>dictionary('education_form',context.stream==='dpo'?'спПрекращенияОО':'Отношения',fact(fields,'education_form'),requiredLater),citizenship:()=>dictionary('citizenship',context.stream==='dpo'?'спГражданство':'гражданство',citizenship,requiredLater),
  original_type:()=>originalFacts?documentLabel(originalFacts,context.stream):null,original_series:()=>originalFacts?absentText('original_series',originalFacts.document_series,originalFields,'series_absence',20,general):null,
  original_number_dpo:()=>originalFacts?text('original_number_dpo',originalFacts.document_number,40,general):null,original_number_po:()=>originalFacts?text('original_number_po',originalFacts.document_number,20,/^\d+$/):null,
  original_reg_dpo:()=>originalFacts?text('original_reg_dpo',originalFacts.reg_number,40,originalRegDpo):null,original_reg_po:()=>originalFacts?text('original_reg_po',originalFacts.reg_number,20,originalRegPo):null,
  original_issue:()=>originalFacts?dateCell('original_issue',originalFacts.issue_date,f.issue_date):null,original_last:()=>originalFacts?named('original_last',originalFacts.last_name):null,original_first:()=>originalFacts?named('original_first',originalFacts.first_name):null,
  original_middle:()=>{if(!originalFacts)return null;const value=absentText('original_middle',originalFacts.middle_name,originalFields,'patronymic_absence',50,namePattern);return typeof value==='string'?named('original_middle',value):null;},change_number:()=>null,
 };
 const cells=OFFICIAL_TEMPLATES[context.stream].columns.map(column=>{const fn=mapped[column.rule];if(!fn)return refuse('TEMPLATE_CHANGED');return fn();});
 if(o.document_status==='duplicate'&&originalFacts&&!documentLabel(originalFacts,context.stream))add('original_type','ORIGINAL_UNCONFIRMED');
 problems.push(issue(context,null,'LEGAL_POLICY_UNVERIFIED','warning'));
 if(problems.length>80)return refuse('LIMIT_EXCEEDED');
 const recordRef={record_id:o.id,record_revision:r.revision,record_state_hash:r.state_hash,frozen_facts_sha256:factsSha,user_id:o.user_id,enrollment_id:o.enrollment_id,course_id:o.course_id,group_id:o.group_id};
 const originalRef=original&&original.frdo_facts&&original.official.user_id&&original.official.enrollment_id&&original.official.course_id?{record_id:original.official.id,record_revision:original.revision,record_state_hash:original.state_hash,frozen_facts_sha256:await sha256(canonicalJson(original.frdo_facts)),user_id:original.official.user_id,enrollment_id:original.official.enrollment_id,course_id:original.official.course_id,group_id:original.official.group_id}:null;ensureCurrent(guard);
 const row_key=await sha256(canonicalJson({organization_id:context.organization_id,scope:context.scope,stream:context.stream,record_id:o.id}));ensureCurrent(guard);
 const body={row_key,record:recordRef,original_record:originalRef,supplement:fields?entry.supplement!.ref:null,original_supplement:originalFields?entry.original_supplement!.ref:null,stream:context.stream,cells,issues:problems,ready:!problems.some(p=>p.severity==='blocker')};
 const row_sha256=await sha256(canonicalJson(body));ensureCurrent(guard);const parsed=c.rowSchema.safeParse({...body,row_sha256});if(!parsed.success)return refuse('INVALID_REQUEST');return {row:parsed.data,issues:problems};
}
/** No mutable profiles/current course reads and no caller-supplied cells or ready flags.
 * A denied item refuses the whole batch; a blocked legacy item is explicit, never skipped. */
export async function mapFrozenProjections(input:unknown,guard:CurrentGuard):Promise<MappedBatch>{
 ensureCurrent(guard);
 // Reject an excessive record count before serializing/cloning any pupil facts.
 if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype)return refuse('INVALID_REQUEST');
 const items=(input as {items?:unknown}).items;if(!Array.isArray(items)||items.length<1||items.length>BOUNDS.rows)return refuse('INVALID_REQUEST');
 canonicalJson(input,BOUNDS.inputBytes);let cloned:unknown;try{cloned=structuredClone(input);}catch{return refuse('INVALID_REQUEST');}
 const parsed=c.foundationInputSchema.safeParse(cloned);if(!parsed.success)return refuse('INVALID_REQUEST');const value=deepFreeze(parsed.data)as FoundationInput;
 canonicalJson(value,BOUNDS.inputBytes);await verifyNativeDictionaries(value.context.stream,guard);ensureCurrent(guard);
 const rows:Row[]=[],blocked_records:MappedBatch['blocked_records']=[];
 for(const entry of value.items){const mapped=await mapOne(value.context,entry,guard);ensureCurrent(guard);if(mapped.row)rows.push(mapped.row);else blocked_records.push({record_id:entry.record.official.id,issues:mapped.issues});}
 const body={context:value.context,rows,blocked_records,ready:blocked_records.length===0&&rows.length>0&&rows.every(row=>row.ready),signing:{status:'not_verified' as const},legal_policy_verification:'pending_primary_current_law' as const};
 const root_sha256=await sha256(canonicalJson(body));ensureCurrent(guard);return c.mappedBatchSchema.parse({...body,root_sha256});
}
