/** Own registered order bytes only. The service context binds the genuine current learner, never a supplied actor. */
import {AdmissionError, admissionExact, admissionHash, admissionObject, admissionRevision, admissionSame,
  admissionTime, admissionUuid, readAdmissionBody, requireAdmissionActor} from './admission-case-access.ts';
import {FaithfulPdfError, validateFaithfulPdf, EDUCATION_PDF_MAX_BYTES} from './faithful-pdf.ts';
import type {IndividualOrderCaller, IndividualOrderService} from './individual-education-order-ports.ts';
import {individualOrderFailureSchema, orderErrorCode} from './individual-education-order-contract.ts';

export const INDIVIDUAL_ORDER_OWN_FILE_REVISION='uc-individual-order-own-file-v1';
export const INDIVIDUAL_ORDER_OWN_FILE_MS=55_000;
type Code=typeof orderErrorCode._type;
const codes:readonly Code[]=orderErrorCode.options;
type Input={version:1;organization_id:string;enrollment_id:string;registry_record_id:string;registry_record_revision:number};
type Context=Input&{ok:true;kind:'own_file_context';order_id:string;order_revision:number;subject_user_id:string;
  source:{kind:'org_document_version';document_id:string;version_id:string;content_hash:string};
  file:{bucket:'org-documents';path:string;sha256:string;bytes:number;mime:'application/pdf'};
  object:{object_id:string;updated_at:string}};
export interface IndividualOrderOwnFileDependencies {
  configured:boolean;
  createCaller(authorization:string,signal:AbortSignal):IndividualOrderCaller;
  createService(signal:AbortSignal):IndividualOrderService;
}
class OwnFileError extends Error {
  constructor(readonly code:Code,readonly status=code==='ACCESS_DENIED'?403:code==='INVALID_INPUT'?400:code==='NOT_FOUND'?404:code==='DEPENDENCY_UNAVAILABLE'?503:code==='LIMIT_EXCEEDED'?413:409,readonly missingFacts:string[]=[]){super(code);}
}
function fail(code:Code='SOURCE_CHANGED'):never{throw new OwnFileError(code);}
const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Expose-Headers':'X-Sintagma-Function-Revision, Content-Disposition',
  'X-Sintagma-Function-Revision':INDIVIDUAL_ORDER_OWN_FILE_REVISION,
  'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff',
};
function check(signal:AbortSignal):void{if(signal.aborted)fail('DEPENDENCY_UNAVAILABLE');}
function same(a:unknown,b:unknown):void{if(!admissionSame(a,b))fail();}
function sha(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('SOURCE_UNAVAILABLE');return value;}
function contextOf(raw:unknown,input:Input,actor:string):Context{
  try{
    admissionExact(raw,['version','ok','kind','organization_id','enrollment_id','registry_record_id','registry_record_revision','order_id','order_revision','subject_user_id','source','file','object']);
    if(raw.version!==1||raw.ok!==true||raw.kind!=='own_file_context')fail('SOURCE_UNAVAILABLE');
    for(const key of ['organization_id','enrollment_id','registry_record_id'] as const)same(admissionUuid(raw[key]),input[key]);
    same(admissionRevision(raw.registry_record_revision),input.registry_record_revision);
    admissionUuid(raw.order_id);admissionRevision(raw.order_revision);same(admissionUuid(raw.subject_user_id),actor);
    admissionExact(raw.source,['kind','document_id','version_id','content_hash']);
    if(raw.source.kind!=='org_document_version')fail('SOURCE_UNAVAILABLE');
    admissionUuid(raw.source.document_id);admissionUuid(raw.source.version_id);sha(raw.source.content_hash);
    admissionExact(raw.file,['bucket','path','sha256','bytes','mime']);
    const file=raw.file;
    if(file.bucket!=='org-documents'||file.mime!=='application/pdf'||typeof file.path!=='string'||file.path.length>2048
      ||!file.path.startsWith([input.organization_id,'versions',raw.source.document_id,''].join('/'))||!file.path.endsWith('.pdf')||/[\x00-\x20\\?#]/.test(file.path)
      ||file.path.split('/').some(part=>!part||part==='.'||part==='..')
      ||!Number.isSafeInteger(file.bytes)||(file.bytes as number)<1||(file.bytes as number)>EDUCATION_PDF_MAX_BYTES)fail('SOURCE_UNAVAILABLE');
    const parts=file.path.split('/');if(parts.length!==4)fail('SOURCE_UNAVAILABLE');admissionUuid(parts[3].slice(0,-4));
    sha(file.sha256);
    admissionExact(raw.object,['object_id','updated_at']);admissionUuid(raw.object.object_id);
    if(typeof raw.object.updated_at!=='string'||!/\.\d{6}Z$/.test(raw.object.updated_at)||admissionTime(raw.object.updated_at)!==raw.object.updated_at)fail('SOURCE_UNAVAILABLE');
    return raw as unknown as Context;
  }catch(error){if(error instanceof OwnFileError)throw error;return fail('SOURCE_UNAVAILABLE');}
}
function result(raw:{data:unknown;error:unknown}):unknown{
  if(raw.error){
    const error=admissionObject(raw.error)?raw.error:{};
    if(error.code==='42501')fail('ACCESS_DENIED');
    if(['55P03','40001','40P01'].includes(String(error.code)))fail('REVISION_CONFLICT');
    const code=typeof error.message==='string'&&error.message.startsWith('UC_INDIVIDUAL_ORDER_')?error.message.slice(20):'';
    if(codes.includes(code as Code))fail(code as Code);
    fail('DEPENDENCY_UNAVAILABLE');
  }
  if(admissionObject(raw.data)&&raw.data.version===1&&raw.data.ok===false){
    const parsed=individualOrderFailureSchema.safeParse(raw.data);
    if(!parsed.success)fail('DEPENDENCY_UNAVAILABLE');
    throw new OwnFileError(parsed.data.code,undefined,parsed.data.missing_facts);
  }
  return raw.data;
}
function storageError(error:unknown):never{
  if(admissionObject(error)){
    if([error.status,error.statusCode].some(value=>String(value)==='403'))fail('ACCESS_DENIED');
    if([error.status,error.statusCode,error.code].some(value=>String(value)==='404'||value==='not_found'||value==='NoSuchKey'))fail('SOURCE_UNAVAILABLE');
  }
  return fail('DEPENDENCY_UNAVAILABLE');
}
function info(raw:unknown,context:Context):void{
  if(!admissionObject(raw))fail('SOURCE_UNAVAILABLE');
  const metadata=admissionObject(raw.metadata)?raw.metadata:null;
  same(raw.id,context.object.object_id);same(raw.name,context.file.path);same(raw.bucketId??raw.bucket_id,context.file.bucket);
  const sizes=[raw.size,metadata?.size].filter(value=>value!==undefined&&value!==null);
  const mimes=[raw.contentType,raw.content_type,metadata?.mimetype].filter(value=>value!==undefined&&value!==null);
  const times=[raw.updatedAt,raw.updated_at,raw.lastModified,raw.last_modified].filter(value=>value!==undefined&&value!==null);
  if(!sizes.length||!mimes.length||!times.length)fail('SOURCE_UNAVAILABLE');
  for(const size of sizes)same(size,context.file.bytes);
  for(const mime of mimes)same(mime,context.file.mime);
  for(const time of times){
    const normalized=admissionTime(time),fraction=(time as string).match(/\.(\d{1,6})(?:Z|\+00:00)$/)?.[1]||'';
    const end=fraction.length?20+fraction.length:19;
    same(normalized.slice(0,end),context.object.updated_at.slice(0,end));
  }
}
async function execute(request:Request,authorization:string,deps:IndividualOrderOwnFileDependencies,signal:AbortSignal):Promise<Response>{
  const body=await readAdmissionBody(request,signal);
  admissionExact(body,['version','organization_id','enrollment_id','registry_record_id','registry_record_revision']);
  if(body.version!==1)fail('INVALID_INPUT');
  const input:Input={version:1,organization_id:admissionUuid(body.organization_id),enrollment_id:admissionUuid(body.enrollment_id),
    registry_record_id:admissionUuid(body.registry_record_id),registry_record_revision:admissionRevision(body.registry_record_revision)};
  if(!deps.configured)fail('DEPENDENCY_UNAVAILABLE');
  const caller=deps.createCaller(authorization,signal),actor=await requireAdmissionActor(caller,authorization);check(signal);
  const service=deps.createService(signal);let pinned:Context|undefined;
  const current=async():Promise<Context>=>{
    check(signal);await requireAdmissionActor(caller,authorization,actor);check(signal);
    const context=contextOf(result(await service.rpc('read_individual_education_order_file_context_service',{p_context:input,p_observed_actor:actor})),input,actor);check(signal);
    await requireAdmissionActor(caller,authorization,actor);check(signal);
    if(pinned)same(context,pinned);else pinned=context;
    return context;
  };
  const context=await current(),storage=service.storage.from(context.file.bucket);
  const first=await storage.info(context.file.path);check(signal);await current();
  if(first.error)storageError(first.error);info(first.data,context);
  const downloaded=await storage.download(context.file.path);check(signal);await current();
  if(downloaded.error)storageError(downloaded.error);
  if(!downloaded.data||downloaded.data.type!=='application/pdf'||downloaded.data.size!==context.file.bytes)fail('SOURCE_UNAVAILABLE');
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());check(signal);
  if(bytes.byteLength!==context.file.bytes||bytes.byteLength>EDUCATION_PDF_MAX_BYTES)fail();
  validateFaithfulPdf(bytes);same(await admissionHash(bytes),context.file.sha256);check(signal);
  const last=await storage.info(context.file.path);check(signal);await current();
  if(last.error)storageError(last.error);info(last.data,context);
  check(signal);
  return new Response(bytes,{status:200,headers:{...headers,'Content-Type':'application/pdf','Content-Length':String(bytes.byteLength),
    'Content-Disposition':'attachment; filename="individual-order.pdf"'}});
}
export async function individualOrderOwnFileRequest(request:Request,deps:IndividualOrderOwnFileDependencies):Promise<Response>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
    if(request.method!=='POST')throw new OwnFileError('INVALID_INPUT',405);
    const authorization=request.headers.get('Authorization')||'';
    if(authorization.length>8192||!/^Bearer [^\s]+$/i.test(authorization))throw new OwnFileError('ACCESS_DENIED',401);
    const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)controller.abort();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new OwnFileError('DEPENDENCY_UNAVAILABLE'));},INDIVIDUAL_ORDER_OWN_FILE_MS);});
      return await Promise.race([execute(request,authorization,deps,controller.signal),deadline]);
    }finally{if(timer)clearTimeout(timer);request.signal.removeEventListener('abort',abort);controller.abort();}
  }catch(error){
    let safe=error instanceof OwnFileError?error:new OwnFileError('DEPENDENCY_UNAVAILABLE');
    if(error instanceof AdmissionError)safe=new OwnFileError(error.code==='LIMIT_REACHED'?'LIMIT_EXCEEDED':codes.includes(error.code as Code)?error.code as Code:'DEPENDENCY_UNAVAILABLE',error.status);
    if(error instanceof FaithfulPdfError)safe=new OwnFileError('SOURCE_UNAVAILABLE');
    return new Response(JSON.stringify({version:1,ok:false,code:safe.code,missing_facts:safe.missingFacts}),{status:safe.status,headers:{...headers,'Content-Type':'application/json'}});
  }
}
