import { File as NodeFile } from 'node:buffer';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { actor,org,uid as id } from './fixtures';
const mock=vi.hoisted(()=>({current:true,session:vi.fn(),upload:vi.fn(),rpc:vi.fn(),from:vi.fn(),header:vi.fn(),read:vi.fn(),fetch:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session},storage:{from:()=>({upload:mock.upload,getPublicUrl:(path:string)=>({data:{publicUrl:'https://safe.invalid/storage/v1/object/public/org-documents/'+path}})})},rpc:mock.rpc,from:mock.from}}));
import { listIssuanceTemplateDocuments,readIssuanceTemplateDocument,prepareIssuanceTemplateCreation,validateIssuanceTemplate,ISSUANCE_TEMPLATE_MAX_BYTES } from '../templateCreation';
const scope={actorId:actor,accessRevision:1,organizationId:org,issuanceScope:{kind:'organization' as const},current:()=>true};
const version=id(960),saved=(documentId:string,name='Макет')=>({id:documentId,organization_id:org,type:'education_issuance_template',name,document_revision:1,current_version_id:version,status:'active',deleted_at:null});
const file=(body:BlobPart='<!doctype html><html><body>Тест</body></html>',name='макет.html')=>new File([body],name,{type:'application/octet-stream'});
let committedId='';
beforeEach(()=>{
 vi.clearAllMocks();mock.current=true;vi.stubGlobal('File',NodeFile);vi.stubEnv('VITE_SUPABASE_URL','https://safe.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','synthetic-public-key');vi.stubGlobal('fetch',mock.fetch);
 mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'synthetic-user-token'}},error:null});
 mock.upload.mockResolvedValue({data:{},error:null});
 mock.rpc.mockImplementation((_name,args)=>({setHeader:mock.header.mockImplementation(async()=>{committedId=args.p_document_id;return {data:{document_id:args.p_document_id,revision:1,version_id:version,version_number:1,replayed:false},error:null,status:200};})}));
 mock.read.mockImplementation(async()=>({data:saved(committedId),error:null}));
 mock.from.mockImplementation(()=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,limit:()=>q,gt:()=>q,single:()=>q,maybeSingle:()=>q,setHeader:(...args:unknown[])=>mock.read(...args)};return q;});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('independent HTML template UC006 creation',()=>{
 it('keeps exact UTF8 bytes including BOM, sets known MIME, and creates a NEW document without a catalogue lookup or mutation',async()=>{
  const bytes=new Uint8Array([239,187,191,...new TextEncoder().encode('<p>Образец №1</p>')]);const source=file(bytes,'образец.HTM');const prepared=await prepareIssuanceTemplateCreation(scope,'  Макет  ',source);const result=await prepared.run(scope);
  const [path,uploaded,options]=mock.upload.mock.calls[0];expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(bytes);expect(uploaded.type).toBe('text/html');expect(options).toMatchObject({upsert:false,contentType:'text/html',headers:{Authorization:'Bearer synthetic-user-token'}});
  expect(path).toBe(org+'/versions/'+prepared.documentId+'/'+prepared.requestId+'.htm');expect(result.id).toBe(prepared.documentId);
  expect(mock.rpc).toHaveBeenCalledWith('commit_org_document_version',expect.objectContaining({p_document_id:prepared.documentId,p_request_id:prepared.requestId,p_expected_revision:0,p_restore_version_id:null,p_document:{name:'Макет',type:'education_issuance_template',status:'active'}}));
  expect(mock.from).toHaveBeenCalledTimes(1);expect(mock.header).toHaveBeenCalledWith('Authorization','Bearer synthetic-user-token');
 });
 it.each([[new Uint8Array([0xc0,0xaf]),'bad.html'],['<p>x</p>','renamed.pdf'],['','empty.html'],['  ','blank.html']])('rejects malformed UTF8, other extension or empty source before storage (%s)',async(body,name)=>{
  await expect(prepareIssuanceTemplateCreation(scope,'Макет',file(body as BlobPart,name as string))).rejects.toMatchObject({name:'IssuanceTemplateInputError'});expect(mock.upload).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('accepts exactly one MiB but refuses the next byte and a blank or oversized name',async()=>{
  const bytes=new Uint8Array(ISSUANCE_TEMPLATE_MAX_BYTES).fill(32);bytes[0]=60;bytes[1]=112;bytes[2]=62;await expect(validateIssuanceTemplate(file(bytes))).resolves.toHaveProperty('size',ISSUANCE_TEMPLATE_MAX_BYTES);
  await expect(validateIssuanceTemplate(file(new Uint8Array(ISSUANCE_TEMPLATE_MAX_BYTES+1)))).rejects.toMatchObject({name:'IssuanceTemplateInputError'});
  for(const name of ['  ','x'.repeat(201)])await expect(prepareIssuanceTemplateCreation(scope,name,file())).rejects.toMatchObject({name:'IssuanceTemplateInputError'});expect(mock.upload).not.toHaveBeenCalled();
 });
 it('retries an unknown commit with exactly the SAME operation UUID and staged file, never a replacement',async()=>{
  const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());let attempt=0;
  mock.rpc.mockImplementation((_name,args)=>({setHeader:async()=>{committedId=args.p_document_id;if(++attempt===1)throw Error('unknown transport');return {data:{document_id:args.p_document_id,revision:1,version_id:version,version_number:1,replayed:true},error:null,status:200};}}));
  await expect(prepared.run(scope)).rejects.toThrow('unknown transport');await expect(prepared.run(scope)).resolves.toHaveProperty('id',prepared.documentId);
  expect(mock.upload).toHaveBeenCalledTimes(1);expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
 });
 it('recovers an unknown upload only after exact private bytes match at the SAME immutable path',async()=>{
  const source=file();const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',source);
  mock.upload.mockResolvedValueOnce({error:{message:'network unknown'}}).mockResolvedValueOnce({error:{statusCode:'409'}});
  await expect(prepared.run(scope)).rejects.toMatchObject({message:'network unknown'});mock.fetch.mockResolvedValue(new Response(await source.arrayBuffer(),{headers:{'content-type':'text/html'}}));
  await expect(prepared.run(scope)).resolves.toHaveProperty('id',prepared.documentId);expect(mock.rpc).toHaveBeenCalledTimes(1);expect(mock.upload.mock.calls[0][0]).toBe(mock.upload.mock.calls[1][0]);
  expect(mock.fetch).toHaveBeenCalledWith('https://safe.invalid/storage/v1/object/authenticated/org-documents/'+mock.upload.mock.calls[0][0],expect.objectContaining({headers:{Authorization:'Bearer synthetic-user-token',apikey:'synthetic-public-key'},redirect:'error',credentials:'omit'}));
 });
 it('never commits a 409 object whose bytes differ, and never upserts or deletes it',async()=>{
  const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.upload.mockResolvedValue({error:{statusCode:409}});mock.fetch.mockResolvedValue(new Response('<p>other</p>',{headers:{'content-type':'text/html'}}));
  await expect(prepared.run(scope)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(mock.rpc).not.toHaveBeenCalled();expect(mock.upload.mock.calls[0][2].upsert).toBe(false);
 });
 it('denies a changed actor or stale scope before any storage/commit call',async()=>{
  const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.session.mockResolvedValue({data:{session:{user:{id:id(990)},access_token:'other'}},error:null});await expect(prepared.run(scope)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  mock.current=false;await expect(prepared.run(scope)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(mock.upload).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('does not continue to commit after a deferred upload crosses a closed context; a return to the same key cannot revive its guard',async()=>{
  let live=true,resolve!:(value:any)=>void;const old={...scope,current:()=>live},pending=new Promise<any>(done=>{resolve=done;});mock.upload.mockReturnValue(pending);
  const prepared=await prepareIssuanceTemplateCreation(old,'Макет',file()),running=prepared.run(old);await vi.waitFor(()=>expect(mock.upload).toHaveBeenCalledTimes(1));live=false;resolve({error:null});await expect(running).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(mock.rpc).not.toHaveBeenCalled();
  await expect(prepared.run({...scope,current:()=>false})).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('times out an unknown commit and permits only an explicit SAME request retry, without a late success callback',async()=>{
  vi.useFakeTimers();const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());let finish!:(v:any)=>void;mock.rpc.mockReturnValue({setHeader:()=>new Promise(done=>{finish=done;})});const running=prepared.run(scope);const rejection=expect(running).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});await vi.advanceTimersByTimeAsync(45000);await rejection;finish({data:{document_id:prepared.documentId,revision:1,version_id:version,version_number:1},error:null});expect(mock.rpc).toHaveBeenCalledTimes(1);
 });
 it('validates the fresh actual saved document/version, never trusting a mismatched commit/read result',async()=>{
  const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.read.mockResolvedValue({data:saved(id(991)),error:null});await expect(prepared.run(scope)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 });

 it('recognizes only typed legacy400 Duplicate as a recovery trigger, with the same private-byte proof',async()=>{
  const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.upload.mockResolvedValue({error:{name:'StorageApiError',status:400,statusCode:'Duplicate',message:'The resource already exists'}});mock.fetch.mockResolvedValue(new Response(await file().arrayBuffer(),{headers:{'content-type':'text/html'}}));await expect(prepared.run(scope)).resolves.toHaveProperty('id',prepared.documentId);
  const other=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.upload.mockResolvedValue({error:{name:'StorageApiError',status:400,message:'Invalid input'}});await expect(other.run(scope)).rejects.toMatchObject({message:'Invalid input'});expect(mock.fetch).toHaveBeenCalledTimes(1);
 });
 it('uses one whole-body45second recovery deadline, cancels a trickled response, and never commits',async()=>{
  vi.useFakeTimers();const prepared=await prepareIssuanceTemplateCreation(scope,'Макет',file());mock.upload.mockResolvedValue({error:{statusCode:409}});const cancel=vi.fn();const stream=new ReadableStream<Uint8Array>({start(controller){setTimeout(()=>controller.enqueue(new TextEncoder().encode('<p>')),30000);},cancel});mock.fetch.mockResolvedValue(new Response(stream,{headers:{'content-type':'text/html'}}));const running=prepared.run(scope),rejection=expect(running).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});await vi.advanceTimersByTimeAsync(45000);await rejection;expect(cancel).toHaveBeenCalledTimes(1);expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rereads the exact selected template independently of list pagination and masks a missing row',async()=>{
  mock.read.mockResolvedValue({data:saved(id(980)),error:null});await expect(readIssuanceTemplateDocument(scope,id(980))).resolves.toHaveProperty('id',id(980));mock.read.mockResolvedValue({data:null,error:null});await expect(readIssuanceTemplateDocument(scope,id(980))).resolves.toBeNull();mock.read.mockResolvedValue({data:{...saved(id(980)),organization_id:id(999)},error:null});await expect(readIssuanceTemplateDocument(scope,id(980))).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 });
 it('lists real independent pending templates with current rights and explicit bounded UUID paging',async()=>{
  const rows=Array.from({length:51},(_,i)=>saved(id(1000+i),'Шаблон'+i));mock.read.mockResolvedValue({data:rows,error:null});const page=await listIssuanceTemplateDocuments(scope);expect(page.items).toHaveLength(50);expect(page.next).toBe(rows[49].id);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.upload).not.toHaveBeenCalled();
  mock.read.mockResolvedValue({data:[rows[0],rows[0]],error:null});await expect(listIssuanceTemplateDocuments(scope)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  mock.read.mockResolvedValue({data:[rows[0]],error:null});await expect(listIssuanceTemplateDocuments(scope,rows[0].id)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
 });
});
