import {individualOrderFailureSchema, individualOrderReadSchema, orderAttestationBindingSchema,
  orderAttestationReplySchema, orderErrorCode, orderRenderInputSchema, orderRenderReplySchema,
  orderRenderRequestSchema, orderTrustedAttestationSchema,
  type IndividualOrderRenderContext} from './individual-education-order-contract.ts';
import {renderIndividualEducationOrder, INDIVIDUAL_ORDER_RENDERER_REVISION} from './individual-education-order-render.ts';
import {educationFonts} from './education-issuance-fonts.ts';
import {admissionHash, admissionSame, admissionTime, readAdmissionBody, requireAdmissionActor,
  AdmissionError} from './admission-case-access.ts';
import {FaithfulPdfError, validateFaithfulPdf, EDUCATION_PDF_MAX_BYTES,
  EDUCATION_RENDER_HTML_MAX_BYTES} from './faithful-pdf.ts';
import type {IndividualOrderCaller as EducationCaller, IndividualOrderService as EducationService,
  IndividualOrderStorage as EducationStorage} from './individual-education-order-ports.ts';

export const INDIVIDUAL_ORDER_ARTIFACT_MS = 55_000;
export const INDIVIDUAL_ORDER_ARTIFACT_REVISION = 'uc-individual-order-artifact-v1';
type Code = typeof orderErrorCode._type;
type Context = IndividualOrderRenderContext;
type Observation = NonNullable<Context['staging']['observed_object']>;
type Input = {version:1;organization_id:string;enrollment_id:string;order_id:string;
  expected_order_revision:number;expected_order_sha256:string;render_request_id:string};
type Slot = 'staging'|'output';
export interface IndividualOrderArtifactDependencies {
  configured:boolean;
  createCaller(authorization:string,signal:AbortSignal):EducationCaller;
  createService(signal:AbortSignal):EducationService;
  render(html:string,signal:AbortSignal):Promise<Uint8Array>;
}
class OrderArtifactError extends Error {
  constructor(readonly code:Code,readonly status=code==='ACCESS_DENIED'?403:code==='INVALID_INPUT'?400:
    code==='LIMIT_EXCEEDED'?413:['DEPENDENCY_UNAVAILABLE','ARTIFACT_RENDER_FAILED'].includes(code)?503:409,
    readonly missingFacts:string[]=[]) {super(code);}
}
function fail(code:Code='SOURCE_CHANGED'):never {throw new OrderArtifactError(code);}
const check=(signal:AbortSignal)=>{if(signal.aborted)fail('DEPENDENCY_UNAVAILABLE');};
const same=(a:unknown,b:unknown)=>{if(!admissionSame(a,b))fail();};
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Expose-Headers':'X-Sintagma-Function-Revision',
  'X-Sintagma-Function-Revision':INDIVIDUAL_ORDER_ARTIFACT_REVISION,
  'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff',
};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
function result(raw:{data:unknown;error:unknown}):unknown {
  if(raw.error){
    const error=record(raw.error)?raw.error:{};
    if(error.code==='42501')fail('ACCESS_DENIED');
    if(['55P03','40001','40P01'].includes(String(error.code)))fail('REVISION_CONFLICT');
    const message=typeof error.message==='string'?error.message:'';
    const parsed=orderErrorCode.safeParse(message.startsWith('UC_INDIVIDUAL_ORDER_')?message.slice(20):null);
    if(parsed.success)fail(parsed.data);
    fail('DEPENDENCY_UNAVAILABLE');
  }
  const failure=individualOrderFailureSchema.safeParse(raw.data);
  if(failure.success)throw new OrderArtifactError(failure.data.code,undefined,failure.data.missing_facts);
  return raw.data;
}
const noObject=(error:unknown)=>record(error)&&[error.statusCode,error.status,error.code].some(value=>
  String(value)==='404'||value==='not_found'||value==='NoSuchKey');
function storageFailure(error:unknown):never {
  if(record(error)&&[error.statusCode,error.status].some(value=>String(value)==='403'))fail('ACCESS_DENIED');
  fail('DEPENDENCY_UNAVAILABLE');
}
function stable(value:Context):unknown {
  const job=value.render_job;
  return {organization_id:value.organization_id,enrollment_id:value.enrollment_id,subject_user_id:value.subject_user_id,
    course_id:value.course_id,actor_user_id:value.actor_user_id,order_id:value.order_id,
    job:{id:job.id,generation:job.generation,request_id:job.request_id,approved_order_revision:job.approved_order_revision,
      approved_order_sha256:job.approved_order_sha256,render_input_sha256:job.render_input_sha256,
      renderer:job.renderer,renderer_revision:job.renderer_revision},
    render_input_json:value.render_input_json,render_input_sha256:value.render_input_sha256,
    staging:{bucket:value.staging.bucket,path:value.staging.path},
    output:{document_id:value.output.document_id,upload_request_id:value.output.upload_request_id,
      expected_document_revision:value.output.expected_document_revision,file_name:value.output.file_name,
      file_path:value.output.file_path,document:value.output.document}};
}
function advance(before:Context,after:Context):void {
  same(stable(before),stable(after));
  if(after.current_order_revision<before.current_order_revision||
    ['prepared','staged','saved'].indexOf(after.render_job.stage)<['prepared','staged','saved'].indexOf(before.render_job.stage))fail();
  if(before.render_job.html_sha256!==null)same(before.render_job.html_sha256,after.render_job.html_sha256);
  if(before.staging.proof)same(before.staging.proof,after.staging.proof);
  if(before.output.source)same(before.output.source,after.output.source);
  if(before.output.object)same(before.output.object,after.output.object);
  if(before.output.artifact){
    const {output_review:_old,...old}=before.output.artifact;
    if(!after.output.artifact)fail();
    const {output_review:_next,...next}=after.output.artifact;
    same(old,next);
  }
  if(before.registry)same(before.registry,after.registry);
  for(const slot of ['staging','output'] as const)if(before[slot].observed_object)same(before[slot].observed_object,after[slot].observed_object);
}
function bindContext(raw:unknown,input:Input,actor:string):Context {
  const parsed=individualOrderReadSchema.safeParse(raw);
  if(!parsed.success||parsed.data.kind!=='render_context')return fail('SOURCE_UNAVAILABLE');
  const envelope=parsed.data,context=envelope.render_context,job=context.render_job;
  for(const key of ['organization_id','enrollment_id','order_id'] as const)same(context[key],input[key]);
  same(envelope.organization_id,input.organization_id);same(envelope.enrollment_id,input.enrollment_id);
  same(envelope.actor_user_id,actor);same(context.actor_user_id,actor);
  same(envelope.subject_user_id,context.subject_user_id);same(envelope.course_id,context.course_id);
  same(job.approved_order_revision,input.expected_order_revision);same(job.approved_order_sha256,input.expected_order_sha256);
  same(job.request_id,input.render_request_id);
  return context as Context;
}
export function prepareIndividualOrderHtml(variables:unknown):string {
  const marker='<style data-uc-individual-order-fonts></style>';
  const html=renderIndividualEducationOrder(variables);
  if(html.split(marker).length!==2)fail('SOURCE_UNAVAILABLE');
  const fonts=educationFonts.map(font=>`@font-face{font-family:"UC019 PTSans";font-style:normal;font-weight:${font.weight};src:url('${font.dataUrl}') format('truetype');font-display:block}`).join('');
  const csp="default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  const output=html.replace(marker,`<meta http-equiv="Content-Security-Policy" content="${csp}"><style>${fonts}</style>`);
  if(new TextEncoder().encode(output).byteLength>EDUCATION_RENDER_HTML_MAX_BYTES)fail('LIMIT_EXCEEDED');
  return output;
}
const provenanceKeys=['version','kind','order_id','render_job_id','render_generation','render_input_sha256','html_sha256','byte_sha256','renderer','renderer_revision'] as const;
const camel=(value:string)=>value.replace(/_([a-z])/g,(_all,letter:string)=>letter.toUpperCase());
function metadata(raw:unknown):Record<string,string> {
  if(!record(raw))return fail('SOURCE_UNAVAILABLE');
  const value:Record<string,string>={};
  for(const key of Object.keys(raw)){
    const canonical=provenanceKeys.find(candidate=>candidate===key||camel(candidate)===key);
    if(!canonical||typeof raw[key]!=='string'||canonical in value)fail();
    value[canonical]=raw[key] as string;
  }
  if(Object.keys(value).length!==provenanceKeys.length)fail();
  return value;
}
function uploadMetadata(observed:Observation['provenance']):Record<string,string> {
  return Object.fromEntries(provenanceKeys.map(key=>[key,String(observed[key])])) as Record<string,string>;
}
function sdkTime(raw:unknown,exact:string):void {
  const normalized=admissionTime(raw);
  const fraction=(raw as string).match(/\.(\d{1,6})(?:Z|\+00:00)$/)?.[1]||'';
  const end=fraction.length?20+fraction.length:19;
  same(normalized.slice(0,end),exact.slice(0,end));
}
function sdkInfo(raw:unknown,bucket:string,path:string,expected:Observation):void {
  if(!record(raw))fail('SOURCE_UNAVAILABLE');
  const stored=record(raw.metadata)?raw.metadata:null;
  if((raw.bucketId??raw.bucket_id)!==bucket||raw.name!==path||raw.id!==expected.object_id)fail();
  const sizes=[raw.size,stored?.size].filter(value=>value!==undefined&&value!==null);
  const mimes=[raw.contentType,raw.content_type,stored?.mimetype].filter(value=>value!==undefined&&value!==null);
  const times=[raw.updatedAt,raw.updated_at,raw.lastModified,raw.last_modified].filter(value=>value!==undefined&&value!==null);
  if(!sizes.length||!mimes.length||!times.length)fail('SOURCE_UNAVAILABLE');
  for(const size of sizes)same(size,expected.byte_size);
  for(const mime of mimes)same(mime,'application/pdf');
  for(const time of times)sdkTime(time,expected.updated_at);
  const user=raw.userMetadata??raw.user_metadata??(stored&&('order_id'in stored||'orderId'in stored)?stored:null);
  same(metadata(user),uploadMetadata(expected.provenance));
}

async function execute(request:Request,authorization:string,deps:IndividualOrderArtifactDependencies,signal:AbortSignal):Promise<Response> {
  const parsed=orderRenderRequestSchema.safeParse(await readAdmissionBody(request,signal));
  if(!parsed.success)fail('INVALID_INPUT');
  if(!deps.configured)fail('DEPENDENCY_UNAVAILABLE');
  const input=parsed.data as Input,caller=deps.createCaller(authorization,signal);
  const actor=await requireAdmissionActor(caller,authorization);check(signal);
  let previous:Context|undefined;
  let frozenInput:ReturnType<typeof orderRenderInputSchema.parse>|undefined;
  const current=async():Promise<Context>=>{
    check(signal);await requireAdmissionActor(caller,authorization,actor);check(signal);
    const raw=result(await caller.rpc('read_individual_education_order',{p_organization_id:input.organization_id,
      p_enrollment_id:input.enrollment_id,p_query:{version:1,kind:'render_context',order_id:input.order_id,
        expected_revision:input.expected_order_revision,expected_state_sha256:input.expected_order_sha256,
        render_request_id:input.render_request_id}}));check(signal);
    await requireAdmissionActor(caller,authorization,actor);check(signal);
    const context=bindContext(raw,input,actor);
    if(previous)advance(previous,context);
    else {
      same(await admissionHash(new TextEncoder().encode(context.render_input_json)),context.render_input_sha256);check(signal);
      let data:unknown;try{data=JSON.parse(context.render_input_json);}catch{return fail('SOURCE_UNAVAILABLE');}
      const decoded=orderRenderInputSchema.safeParse(data);if(!decoded.success)return fail('SOURCE_UNAVAILABLE');
      frozenInput=decoded.data;
      for(const key of ['organization_id','enrollment_id','subject_user_id','course_id','order_id'] as const)same(frozenInput[key],context[key]);
      same(frozenInput.approved_order_revision,input.expected_order_revision);same(frozenInput.approved_order_sha256,input.expected_order_sha256);
      same(frozenInput.render_job_id,context.render_job.id);same(frozenInput.render_generation,context.render_job.generation);
      same(frozenInput.variables.document_date,context.output.document.issue_date);
    }
    previous=context;return context;
  };
  let context=await current();
  if(!frozenInput)fail('SOURCE_UNAVAILABLE');
  const html=prepareIndividualOrderHtml(frozenInput.variables),htmlSha=await admissionHash(new TextEncoder().encode(html));check(signal);
  context=await current();
  if(context.render_job.html_sha256!==null)same(context.render_job.html_sha256,htmlSha);
  const service=deps.createService(signal);
  const path=(value:Context,slot:Slot)=>slot==='staging'?value.staging.path:value.output.file_path;
  const bucket=(value:Context,slot:Slot)=>slot==='staging'?value.staging.bucket:'org-documents';
  const observe=async(slot:Slot,storage:EducationStorage,absent=false):Promise<Observation|null>=>{
    const before=await current(),expected=before[slot].observed_object;
    const response=await storage.from(bucket(before,slot)).info(path(before,slot));check(signal);
    const after=await current();same(expected,after[slot].observed_object);
    if(response.error){
      if(noObject(response.error)){if(absent&&expected===null)return null;return fail('SOURCE_UNAVAILABLE');}
      return storageFailure(response.error);
    }
    if(!expected)fail();
    sdkInfo(response.data,bucket(before,slot),path(before,slot),expected);
    return expected;
  };
  const readBytes=async(slot:Slot,storage:EducationStorage,expected:Observation):Promise<Uint8Array>=>{
    const before=await current();same(before[slot].observed_object,expected);
    const response=await storage.from(bucket(before,slot)).download(path(before,slot));check(signal);
    const after=await current();same(expected,after[slot].observed_object);
    if(response.error){if(noObject(response.error))return fail('SOURCE_UNAVAILABLE');return storageFailure(response.error);}
    if(!response.data||response.data.size!==expected.byte_size||response.data.type!=='application/pdf')fail('SOURCE_UNAVAILABLE');
    const bytes=new Uint8Array(await response.data.arrayBuffer());check(signal);
    if(bytes.length!==expected.byte_size||bytes.length>EDUCATION_PDF_MAX_BYTES)fail();
    validateFaithfulPdf(bytes);same(await admissionHash(bytes),expected.provenance.byte_sha256);check(signal);
    const final=await current();same(expected,final[slot].observed_object);
    return bytes;
  };
  const binding=()=>orderAttestationBindingSchema.parse({version:1,organization_id:context.organization_id,
    enrollment_id:context.enrollment_id,subject_user_id:context.subject_user_id,course_id:context.course_id,
    order_id:context.order_id,approved_order_revision:context.render_job.approved_order_revision,
    approved_order_sha256:context.render_job.approved_order_sha256,render_job_id:context.render_job.id,
    render_generation:context.render_job.generation,render_request_id:context.render_job.request_id,
    render_input_sha256:context.render_input_sha256,renderer:'browserless',renderer_revision:INDIVIDUAL_ORDER_RENDERER_REVISION});
  const attest=async(proof:unknown,expected:Observation,kind:'staging_attested'|'artifact_attested')=>{
    context=await current();const p=orderTrustedAttestationSchema.parse(proof);
    const raw=result(await service.rpc('attest_individual_education_order_artifact_service',{
      p_context:binding(),p_observed_actor:actor,p_proof:p}));check(signal);
    const parsedReply=orderAttestationReplySchema.safeParse(raw);if(!parsedReply.success)fail('SOURCE_UNAVAILABLE');
    const reply=parsedReply.data;
    for(const key of ['organization_id','enrollment_id','order_id'] as const)same(reply[key],context[key]);
    same(reply.kind,kind);same(reply.render_job_id,context.render_job.id);same(reply.render_generation,context.render_job.generation);
    same(reply.render_request_id,context.render_job.request_id);same(reply.render_input_sha256,context.render_input_sha256);
    same(reply.byte_sha256,expected.provenance.byte_sha256);same(reply.byte_size,expected.byte_size);
    same(reply.html_sha256,htmlSha);same(reply.object,{object_id:expected.object_id,updated_at:expected.updated_at});
    if(kind==='artifact_attested')same(reply.source,context.output.source);
    context=await current();
    if(kind==='staging_attested'){
      if(!context.staging.proof)fail();
      same(context.staging.proof.proof_id,reply.proof_id);
      same(context.staging.proof.object_id,expected.object_id);same(context.staging.proof.updated_at,expected.updated_at);
    }else{
      if(!context.output.artifact)fail();
      same(context.output.artifact.proof_id,reply.proof_id);same(context.output.artifact.source,reply.source);
    }
  };

  let stage=await observe('staging',service.storage,true);context=await current();
  if(!stage){
    if(context.staging.proof)fail();
    const rendered=await deps.render(html,signal);check(signal);validateFaithfulPdf(rendered);
    const byteSha=await admissionHash(rendered);check(signal);context=await current();
    const provenance:Observation['provenance']={version:1,kind:'individual_order',order_id:context.order_id,
      render_job_id:context.render_job.id,render_generation:context.render_job.generation,
      render_input_sha256:context.render_input_sha256,html_sha256:htmlSha,byte_sha256:byteSha,
      renderer:'browserless',renderer_revision:INDIVIDUAL_ORDER_RENDERER_REVISION};
    let uploadedId:string|undefined;
    try {
      const uploaded=await service.storage.from(context.staging.bucket).upload(context.staging.path,Uint8Array.from(rendered).buffer,
        {contentType:'application/pdf',upsert:false,cacheControl:'0',metadata:uploadMetadata(provenance)});
      check(signal);if(!uploaded.error)uploadedId=uploaded.data?.id;
    }catch{check(signal);}
    context=await current();stage=await observe('staging',service.storage);context=await current();
    if(!stage||uploadedId!==undefined&&uploadedId!==stage.object_id)fail();
  }
  same(stage.provenance.html_sha256,htmlSha);
  const staged=await readBytes('staging',service.storage,stage);context=await current();
  if(!context.staging.proof){
    await attest({kind:'staging',object_id:stage.object_id,object_updated_at:stage.updated_at,
      html_sha256:htmlSha,render_input_sha256:context.render_input_sha256,byte_sha256:stage.provenance.byte_sha256,
      byte_size:stage.byte_size,renderer:'browserless',renderer_revision:INDIVIDUAL_ORDER_RENDERER_REVISION},stage,'staging_attested');
  }
  if(!context.staging.proof)fail();
  same(context.staging.proof.object_id,stage.object_id);same(context.staging.proof.updated_at,stage.updated_at);
  if(!context.output.source){
    context=await current();let uploadError:unknown=null;
    try{
      const response=await caller.storage.from('org-documents').upload(context.output.file_path,Uint8Array.from(staged).buffer,
        {contentType:'application/pdf',upsert:false,cacheControl:'0',metadata:uploadMetadata(stage.provenance)});
      check(signal);uploadError=response.error;
    }catch(error){check(signal);uploadError=error;}
    context=await current();const output=await observe('output',caller.storage,true);context=await current();
    if(!output)storageFailure(uploadError);
    same(output.provenance,stage.provenance);same(output.byte_size,stage.byte_size);
    await readBytes('output',caller.storage,output);context=await current();
    result(await caller.rpc('commit_org_document_version',{p_document_id:context.output.document_id,
      p_organization_id:context.organization_id,p_request_id:context.output.upload_request_id,p_expected_revision:0,
      p_upload:{file_path:context.output.file_path,file_name:context.output.file_name,file_size:stage.byte_size,
        change_summary:'Сформирован PDF приказа; регистрация выполняется после проверки ответственным.'},
      p_restore_version_id:null,p_document:context.output.document}));check(signal);context=await current();
  }
  if(!context.output.source||!context.output.object)fail();
  const output=await observe('output',caller.storage);context=await current();
  if(!output)fail('SOURCE_UNAVAILABLE');
  same(output.provenance,stage.provenance);same(output.byte_size,stage.byte_size);
  same(context.output.object,{object_id:output.object_id,updated_at:output.updated_at});
  await readBytes('output',caller.storage,output);context=await current();
  if(!context.output.artifact){
    await attest({kind:'output',source:context.output.source,object_id:output.object_id,object_updated_at:output.updated_at,
      staging_object_id:stage.object_id,staging_updated_at:stage.updated_at,byte_sha256:stage.provenance.byte_sha256,
      byte_size:stage.byte_size,render_input_sha256:context.render_input_sha256,html_sha256:htmlSha,
      renderer:'browserless',renderer_revision:INDIVIDUAL_ORDER_RENDERER_REVISION},output,'artifact_attested');
  }
  if(!context.output.artifact||!['rendered_unregistered','registered'].includes(context.current_order_state))fail();
  check(signal);
  return json(orderRenderReplySchema.parse({version:1,ok:true,kind:'artifact_saved',organization_id:context.organization_id,
    enrollment_id:context.enrollment_id,order_id:context.order_id,render_job_id:context.render_job.id,
    render_generation:context.render_job.generation,render_request_id:context.render_job.request_id,
    approved_order_revision:context.render_job.approved_order_revision,approved_order_sha256:context.render_job.approved_order_sha256,
    status:context.current_order_state,artifact:context.output.artifact,registry:context.registry}));
}

export async function individualOrderArtifactRequest(request:Request,deps:IndividualOrderArtifactDependencies):Promise<Response> {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
    if(request.method!=='POST')throw new OrderArtifactError('INVALID_INPUT',405);
    const authorization=request.headers.get('Authorization')||'';
    if(authorization.length>8192||!/^Bearer [^\s]+$/i.test(authorization))throw new OrderArtifactError('ACCESS_DENIED',401);
    const controller=new AbortController(),abort=()=>controller.abort();
    request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)controller.abort();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const expired=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new OrderArtifactError('DEPENDENCY_UNAVAILABLE'));},INDIVIDUAL_ORDER_ARTIFACT_MS);});
      return await Promise.race([execute(request,authorization,deps,controller.signal),expired]);
    }finally{if(timer)clearTimeout(timer);request.signal.removeEventListener('abort',abort);controller.abort();}
  }catch(error){
    let safe=error instanceof OrderArtifactError?error:new OrderArtifactError('DEPENDENCY_UNAVAILABLE');
    if(error instanceof FaithfulPdfError)safe=new OrderArtifactError('ARTIFACT_RENDER_FAILED');
    if(error instanceof AdmissionError)safe=new OrderArtifactError(error.code==='LIMIT_REACHED'?'LIMIT_EXCEEDED':orderErrorCode.safeParse(error.code).success?error.code as Code:'DEPENDENCY_UNAVAILABLE',error.status);
    return json({version:1,ok:false,code:safe.code,missing_facts:safe.missingFacts},safe.status);
  }
}
