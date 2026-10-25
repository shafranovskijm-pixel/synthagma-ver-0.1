import { AccessError } from './privileged-access.ts';
import { parseSelfExaminationCapture, projectSelfExaminationCapture, type SelfExaminationGenerationCapture } from './self-examination-projector.ts';
import { renderSelfExaminationDraft } from './self-examination-renderer.ts';
import { validateSelfExaminationSource, type SelfExaminationSource } from './self-examination-workflow-contract.ts';
export interface GenerationDb {from(table:string):any;rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:any;error:any}>;storage:{from(bucket:string):any}}
export interface GenerationCommand {organizationId:string;reportingYear:number;draftId:string;expectedFactHash:string;expectedRevision:number;requestId:string;documentId:string;expectedDocumentRevision:number;orderId:string|null}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function canonicalSelfExamination(value:unknown):string{if(Array.isArray(value))return'['+value.map(canonicalSelfExamination).join(',')+']';if(object(value))return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalSelfExamination(value[key])).join(',')+'}';return JSON.stringify(value);}
const same=(a:unknown,b:unknown)=>canonicalSelfExamination(a)===canonicalSelfExamination(b);
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
function failure(error:any):never{throw new AccessError(error?.code==='42501'?403:['40001','55000','22023'].includes(error?.code)||/^SELF_EXAMINATION_/.test(error?.message??'')?409:503,error?.code==='42501'?'Доступ к самообследованию изменился.':'Не удалось подтвердить текущий черновик или исходники. Обновите данные; прежние версии сохранены.');}
async function call(db:GenerationDb,name:string,args:Record<string,unknown>){const r=await db.rpc(name,args);if(r.error)failure(r.error);return r.data;}
function mutation(data:unknown,c:GenerationCommand,actorId:string,requestId:string,kind:string){
 if(!object(data)||data.schema_version!==1||data.request_id!==requestId||typeof data.replayed!=='boolean'||!object(data.receipt)||data.receipt.request_id!==requestId||data.receipt.actor_id!==actorId||data.receipt.organization_id!==c.organizationId||data.receipt.reporting_year!==c.reportingYear||data.receipt.action!==kind||!Number.isSafeInteger(data.receipt.revision)||!uuid.test(String(data.receipt.draft_id))||!object(data.draft)||data.draft.id!==data.receipt.draft_id||data.draft.organization_id!==c.organizationId||data.draft.reporting_year!==c.reportingYear)throw new AccessError(503,'Не удалось подтвердить результат сохранения черновика.');return data;
}
async function read(db:GenerationDb,c:GenerationCommand){const data=await call(db,'read_self_examination_draft',{p_organization_id:c.organizationId,p_reporting_year:c.reportingYear});if(!object(data)||data.schema_version!==1||data.organization_id!==c.organizationId||data.reporting_year!==c.reportingYear||!object(data.draft)||data.draft.organization_id!==c.organizationId||data.draft.reporting_year!==c.reportingYear||!Array.isArray(data.draft.facts)||data.draft.can_write!==true)throw new AccessError(403,'Сохранённый черновик этого года недоступен.');return data.draft;}
async function recordId(id:string){const hash=await digest(new TextEncoder().encode('uc025_record_generation:'+id));return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);}
/** All SQL and private Storage operations retain the verified original JWT. No service role projection. */
export async function generateSelfExaminationDraft(db:GenerationDb,c:GenerationCommand,actorId:string,ensureActor:()=>Promise<void>,completeOrder:()=>Promise<void>){
 if(!uuid.test(c.draftId)||!(/^[a-f0-9]{64}$/).test(c.expectedFactHash)||!uuid.test(actorId)||!uuid.test(c.organizationId)||!uuid.test(c.requestId)||!uuid.test(c.documentId)||!Number.isSafeInteger(c.reportingYear)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<1||!Number.isSafeInteger(c.expectedDocumentRevision)||c.expectedDocumentRevision<0||!(c.orderId===null||uuid.test(c.orderId)))throw new AccessError(400,'Укажите сохранённый черновик, год и целевой документ.');
 await ensureActor();
 const prepared=mutation(await call(db,'apply_self_examination_draft',{p_organization_id:c.organizationId,p_reporting_year:c.reportingYear,p_expected_revision:c.expectedRevision,p_request_id:c.requestId,p_action:{kind:'prepare_generation',order_id:c.orderId,document_id:c.documentId,expected_document_revision:c.expectedDocumentRevision}}),c,actorId,c.requestId,'prepare_generation');
 const capture=parseSelfExaminationCapture(prepared.generation_capture);
 if(prepared.receipt.draft_id!==c.draftId||capture.fact_hash!==c.expectedFactHash||capture.generation_id!==prepared.receipt.event_id||capture.prepared_by!==actorId||capture.reporting_year!==c.reportingYear||capture.document_id!==c.documentId||capture.expected_document_revision!==c.expectedDocumentRevision||capture.order_id!==c.orderId)throw new AccessError(503,'Захват фактов не соответствует запросу.');
 const guard=async()=>{await ensureActor();const current=await read(db,c);if(current.id!==prepared.receipt.draft_id||current.fact_hash!==capture.fact_hash||!same(current.facts,capture.facts)||!same(current.body,capture.body))throw new AccessError(409,'Факты или источники изменились во время подготовки. Прежние файлы сохранены; подготовьте новый черновик.');return current;};
 await guard();
 const html=renderSelfExaminationDraft(projectSelfExaminationCapture(capture)),bytes=new TextEncoder().encode(html);
 if(bytes.byteLength<1||bytes.byteLength>8*1024*1024)throw new AccessError(409,'Размер черновика превышает допустимый. Уменьшите объём сведений.');
 const sha=await digest(bytes),filePath=c.organizationId+'/versions/'+c.documentId+'/'+capture.generation_id+'.html',summary='Черновик самообследования '+c.reportingYear+'; захват '+capture.generation_id;
 let previous=await db.from('org_document_versions').select('id,document_id,organization_id,file_path,file_url,request_id,request_payload,document_metadata').eq('organization_id',c.organizationId).eq('request_id',capture.generation_id).maybeSingle();
 if(previous.error)failure(previous.error);
 if(previous.data&&(previous.data.document_id!==c.documentId||previous.data.file_path!==filePath||previous.data.document_metadata?.type!=='self_examination_report'||previous.data.request_payload?.upload?.change_summary!==summary))throw new AccessError(409,'Идентификатор захвата уже связан с другой версией.');
 if(!previous.data){
  await guard();
  const upload=await db.storage.from('org-documents').upload(filePath,new Blob([bytes],{type:'text/html'}),{contentType:'text/html',upsert:false});
  // A duplicate or uncertain upload is accepted only after exact original-JWT byte readback below.
  if(upload.error&&![409,'409','Duplicate','ResourceAlreadyExists'].includes(upload.error.statusCode??upload.error.status??upload.error.error))failure(upload.error);
 }
 await guard();
 const downloaded=await db.storage.from('org-documents').download(filePath);if(downloaded.error||!downloaded.data||downloaded.data.size!==bytes.byteLength)throw new AccessError(409,'Не удалось подтвердить байты сохранённого черновика. Повторите тот же запрос.');
 const actual=new Uint8Array(await downloaded.data.arrayBuffer());if(actual.byteLength!==bytes.byteLength||await digest(actual)!==sha)throw new AccessError(409,'Сохранённый файл отличается от захваченных фактов.');
 await guard();
 if(!previous.data){
  const committed=await call(db,'commit_org_document_version',{p_document_id:c.documentId,p_organization_id:c.organizationId,p_request_id:capture.generation_id,p_expected_revision:c.expectedDocumentRevision,p_restore_version_id:null,p_upload:{file_path:filePath,file_name:'Самообследование '+c.reportingYear+' — черновик.html',file_size:bytes.byteLength,change_summary:summary},p_document:{name:'Отчёт о результатах самообследования '+c.reportingYear,type:'self_examination_report'}});
  if(!object(committed)||!uuid.test(String(committed.version_id)))throw new AccessError(503,'Файл сохранён, но версия не подтверждена. Повторите тот же запрос.');
  previous=await db.from('org_document_versions').select('id,document_id,organization_id,file_path,file_url,request_id,request_payload,document_metadata').eq('id',committed.version_id).eq('organization_id',c.organizationId).eq('request_id',capture.generation_id).single();if(previous.error)failure(previous.error);
 }
 if(!previous.data||previous.data.document_id!==c.documentId||previous.data.file_path!==filePath||previous.data.request_id!==capture.generation_id||previous.data.document_metadata?.type!=='self_examination_report')throw new AccessError(409,'Версия не соответствует сохранённому черновику.');
 const choice=await call(db,'read_document_registry',{p_org:c.organizationId,p_scope:{kind:'organization'},p_query:{kind:'source',document_id:c.documentId,version_id:previous.data.id}});
 if(!object(choice)||choice.kind!=='source'||!object(choice.source)||!object(choice.source.source))throw new AccessError(409,'Точная версия файла пока не доступна как исходник.');
 const source:SelfExaminationSource=validateSelfExaminationSource(choice.source.source);if(source.document_id!==c.documentId||source.version_id!==previous.data.id)throw new AccessError(409,'Источник не соответствует сохранённой версии.');
 await guard();
 const requestId=await recordId(c.requestId),recorded=mutation(await call(db,'apply_self_examination_draft',{p_organization_id:c.organizationId,p_reporting_year:c.reportingYear,p_expected_revision:prepared.receipt.revision,p_request_id:requestId,p_action:{kind:'record_generation',generation_id:capture.generation_id,source,byte_sha256:sha}}),c,actorId,requestId,'record_generation');
 await guard();
 if(recorded.draft.latest_artifact?.generation_id!==capture.generation_id||recorded.draft.latest_artifact?.byte_sha256!==sha||!same(recorded.draft.latest_artifact?.source,source))throw new AccessError(503,'Не удалось подтвердить историю сформированного файла.');
 await completeOrder();await ensureActor();
 return{success:true,requestId:c.requestId,generationId:capture.generation_id,versionId:source.version_id,documentId:c.documentId,reportingYear:c.reportingYear,fileUrl:previous.data.file_url,replayed:prepared.replayed||recorded.replayed,status:'draft_requires_centre_review',message:'Черновик сохранён. Утверждение и размещение выполняет учебный центр.'};
}
