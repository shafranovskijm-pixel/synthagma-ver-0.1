import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { createDocumentUploadOperation, saveDocumentUpload, type OrgDocumentClient } from '@/lib/orgDocumentLifecycle';
import { EducationIssuanceError, requireIssuanceScope, type EducationIssuanceScope } from './client';
import { sameCopyValue } from '@/lib/copyRegistry/value';

export const ISSUANCE_TEMPLATE_MAX_BYTES=1048576;
export const ISSUANCE_TEMPLATE_TYPE='education_issuance_template';
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const templateSchema=z.object({id:uuid,organization_id:uuid,type:z.literal(ISSUANCE_TEMPLATE_TYPE),name:z.string().min(1).max(1000),document_revision:z.number().int().min(1),current_version_id:uuid,status:z.enum(['active','archived','expired']).nullable(),deleted_at:z.null()}).strict();
export type IssuanceTemplateDocument=z.infer<typeof templateSchema>;
export class IssuanceTemplateInputError extends Error { constructor(message:string){super(message);this.name='IssuanceTemplateInputError';} }
async function authorization(scope:EducationIssuanceScope){
 requireIssuanceScope(scope);const result=await boundedRequest(supabase.auth.getSession());requireIssuanceScope(scope);
 if(result.error||result.data.session?.user.id!==scope.actorId||!result.data.session.access_token)throw new EducationIssuanceError('ACCESS_DENIED');
 return 'Bearer '+result.data.session.access_token;
}
function storageError(error:unknown){if(error)throw error;}
async function boundedRequest<T>(request:PromiseLike<T>,timeoutMs=45000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(request),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new EducationIssuanceError('DEPENDENCY_UNAVAILABLE',true)),Math.max(0,timeoutMs));})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
async function readBoundedTemplate(response:Response){
 const reader=response.body?.getReader();if(!reader)throw new EducationIssuanceError('SOURCE_CHANGED');
 const chunks:Uint8Array[]=[];let size=0;const deadline=Date.now()+45000;
 try{while(true){const value=await boundedRequest(reader.read(),deadline-Date.now());if(value.done)break;size+=value.value.length;if(size>ISSUANCE_TEMPLATE_MAX_BYTES)throw new EducationIssuanceError('SOURCE_CHANGED');chunks.push(value.value);}}
 finally{void reader.cancel().catch(()=>undefined);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function validateIssuanceTemplate(file:File){
 if(!/\.html?$/i.test(file.name))throw new IssuanceTemplateInputError('Выберите файл HTML или HTM.');
 if(file.size<1||file.size>ISSUANCE_TEMPLATE_MAX_BYTES)throw new IssuanceTemplateInputError('Размер HTML-шаблона должен быть от 1 байта до 1 МБ.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes.length!==file.size)throw new IssuanceTemplateInputError('Не удалось подтвердить размер файла. Выберите его заново.');
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new IssuanceTemplateInputError('Сохраните HTML-шаблон в кодировке UTF-8.');}
 const encoded=new TextEncoder().encode(text);
 if(!text.trim()||encoded.length!==bytes.length||bytes.some((n,i)=>n!==encoded[i]))throw new IssuanceTemplateInputError('Нужен непустой HTML-файл в кодировке UTF-8.');
 // Preserve original bytes, including a valid UTF-8 BOM. Never sanitize or silently rewrite the saved source.
 return new File([bytes.slice().buffer],file.name,{type:'text/html',lastModified:file.lastModified});
}
/** New independent UC006 document, never a replacement of a catalogue type. Keep this operation after unknown results. */
export async function prepareIssuanceTemplateCreation(scope:EducationIssuanceScope,name:string,file:File){
 requireIssuanceScope(scope);const title=name.trim();
 if(!title||title.length>200)throw new IssuanceTemplateInputError('Введите название шаблона — до 200 символов.');
 const canonicalFile=await validateIssuanceTemplate(file);requireIssuanceScope(scope);
 const binding={actor:scope.actorId,organization:scope.organizationId,revision:scope.accessRevision,scope:structuredClone(scope.issuanceScope)};
 const operation=createDocumentUploadOperation({organizationId:scope.organizationId,expectedRevision:0,file:canonicalFile,document:{name:title,type:ISSUANCE_TEMPLATE_TYPE,status:'active'}});
 let running=false;
 return {documentId:operation.documentId,requestId:operation.requestId,name:title,fileName:canonicalFile.name,run:async(currentScope:EducationIssuanceScope):Promise<IssuanceTemplateDocument>=>{
  if(running)throw new EducationIssuanceError('REVISION_CONFLICT');
  requireIssuanceScope(currentScope);
  if(!sameCopyValue(binding,{actor:currentScope.actorId,organization:currentScope.organizationId,revision:currentScope.accessRevision,scope:currentScope.issuanceScope}))throw new EducationIssuanceError('ACCESS_DENIED');
  running=true;
  try{
   const client:OrgDocumentClient={storage:{from(bucket){if(bucket!=='org-documents')throw new EducationIssuanceError('INVALID_INPUT');return {
    getPublicUrl(path){requireIssuanceScope(currentScope);return supabase.storage.from(bucket).getPublicUrl(path);},
    async upload(path,body,options){
     const bearer=await authorization(currentScope);requireIssuanceScope(currentScope);
     const result=await boundedRequest(supabase.storage.from(bucket).upload(path,body,{...options,headers:{Authorization:bearer}}));requireIssuanceScope(currentScope);
     const storageFailure=result.error as {name?:string;statusCode?:string|number;status?:number;message?:string}|null;
     const status=String(storageFailure?.statusCode??storageFailure?.status??'');
     const httpStatus=String(storageFailure?.status??storageFailure?.statusCode??'');
     const duplicate=status==='409'||httpStatus==='409'||httpStatus==='400'&&storageFailure?.name==='StorageApiError'&&storageFailure.message==='The resource already exists';
     if(result.error&&duplicate){
      // An earlier upload may have completed with its response lost. Compare exact immutable bytes before retrying the SAME commit.
      const locator=supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      const url=new URL(locator);const marker='/storage/v1/object/public/org-documents/';
      const project=new URL(import.meta.env.VITE_SUPABASE_URL),apiKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if(url.origin!==project.origin||url.pathname!==project.pathname.replace(/\/$/,'')+marker+path||url.search||url.hash||!apiKey?.trim())throw new EducationIssuanceError('SOURCE_CHANGED');
      url.pathname=project.pathname.replace(/\/$/,'')+'/storage/v1/object/authenticated/org-documents/'+path;
      const response=await boundedRequest(fetch(url.toString(),{headers:{Authorization:bearer,apikey:apiKey},credentials:'omit',cache:'no-store',redirect:'error'}));requireIssuanceScope(currentScope);
      if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/html')throw new EducationIssuanceError('SOURCE_CHANGED');
      const declared=response.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>ISSUANCE_TEMPLATE_MAX_BYTES||!response.headers.get('content-encoding')&&Number(declared)!==body.size))throw new EducationIssuanceError('SOURCE_CHANGED');
      const existing=await readBoundedTemplate(response),expected=new Uint8Array(await body.arrayBuffer());requireIssuanceScope(currentScope);
      if(existing.length!==expected.length||existing.length>ISSUANCE_TEMPLATE_MAX_BYTES||existing.some((n,i)=>n!==expected[i]))throw new EducationIssuanceError('SOURCE_CHANGED');
      return {error:null};
     }
     return {error:result.error};
    }
   };}},rpc:async(name,args)=>{
    const bearer=await authorization(currentScope);requireIssuanceScope(currentScope);
    const result=await boundedRequest(supabase.rpc(name as never,args as never).setHeader('Authorization',bearer));requireIssuanceScope(currentScope);
    if(result.status===401||result.status===403)throw new EducationIssuanceError('ACCESS_DENIED');return result;
   }};
   const saved=await saveDocumentUpload(operation,client);requireIssuanceScope(currentScope);
   if(saved.document_id!==operation.documentId||!uuid.safeParse(saved.version_id).success||saved.version_number!==1||saved.revision!==1)throw new EducationIssuanceError('SOURCE_CHANGED');
   const actual=await readIssuanceTemplateDocument(currentScope,operation.documentId);
   if(!actual||actual.name!==title||actual.current_version_id!==saved.version_id||actual.document_revision!==saved.revision)throw new EducationIssuanceError('SOURCE_CHANGED');
   return actual;
  }finally{running=false;}
 }};
}
export type PreparedIssuanceTemplateCreation=Awaited<ReturnType<typeof prepareIssuanceTemplateCreation>>;
/** Exact reread is independent of the current list page; omission from page1 never proves the selected version unchanged. */
export async function readIssuanceTemplateDocument(scope:EducationIssuanceScope,documentId:string){
 if(!uuid.safeParse(documentId).success)throw new EducationIssuanceError('INVALID_INPUT');
 const bearer=await authorization(scope);
 const result=await boundedRequest(supabase.from('org_documents').select('id,organization_id,type,name,document_revision,current_version_id,status,deleted_at').eq('organization_id',scope.organizationId).eq('id',documentId).eq('type',ISSUANCE_TEMPLATE_TYPE).is('deleted_at',null).maybeSingle().setHeader('Authorization',bearer));requireIssuanceScope(scope);storageError(result.error);
 if(result.data===null)return null;
 const parsed=templateSchema.safeParse(result.data);
 if(!parsed.success||parsed.data.id!==documentId||parsed.data.organization_id!==scope.organizationId)throw new EducationIssuanceError('SOURCE_CHANGED');
 return parsed.data;
}
/** Explicit pages of current-authorized independent templates, including pending UC011 review. Read only. */
export async function listIssuanceTemplateDocuments(scope:EducationIssuanceScope,after:string|null=null){
 if(after!==null&&!uuid.safeParse(after).success)throw new EducationIssuanceError('INVALID_INPUT');
 const bearer=await authorization(scope);
 let query=supabase.from('org_documents').select('id,organization_id,type,name,document_revision,current_version_id,status,deleted_at').eq('organization_id',scope.organizationId).eq('type',ISSUANCE_TEMPLATE_TYPE).is('deleted_at',null).order('id',{ascending:true}).limit(51);
 if(after)query=query.gt('id',after);
 const result=await boundedRequest(query.setHeader('Authorization',bearer));requireIssuanceScope(scope);storageError(result.error);
 const parsed=z.array(templateSchema).max(51).safeParse(result.data);
 if(!parsed.success)throw new EducationIssuanceError('SOURCE_CHANGED');
 let previous=after;for(const row of parsed.data){if(row.organization_id!==scope.organizationId||previous!==null&&row.id<=previous)throw new EducationIssuanceError('SOURCE_CHANGED');previous=row.id;}
 return {items:parsed.data.slice(0,50),next:parsed.data.length>50?parsed.data[49].id:null};
}
