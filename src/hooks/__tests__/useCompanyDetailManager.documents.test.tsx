import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompanyDetailManager } from '@/hooks/useCompanyDetailManager';
import { CompanyDocumentsTab } from '@/components/company/CompanyDocumentsTab';
import type { Company, CompanyDocument } from '@/hooks/useCompaniesManager';

const companyId='00000000-0000-4000-8000-000000000100';
const fileId='00000000-0000-4000-8000-000000000101';
const company={id:companyId,name:'Synthetic company',inn:null,kpp:null,ogrn:null,address:null,director:null,email:null,created_at:'2026-10-18T00:00:00Z'} as Company;
const documentRecord={id:'document-old',company_id:companyId,name:'Existing contract',type:'contract',file_url:null,file_path:`${companyId}/original.pdf`,file_size:4,uploaded_at:'2026-10-17T00:00:00Z',is_paid:false,paid_at:null,amount:null,contract_number:null} as CompanyDocument;
const mocks=vi.hoisted(()=>({
 docs:[] as any[],queries:[] as {table:string;filters:[string,unknown][]}[],
 uploadError:null as unknown,insertError:null as unknown,rpcError:null as unknown,
 upload:vi.fn(),insert:vi.fn(),update:vi.fn(),hardDelete:vi.fn(),remove:vi.fn(),getPublicUrl:vi.fn(),createSignedUrl:vi.fn(),rpc:vi.fn(),
 success:vi.fn(),error:vi.fn(),openPrivateFile:vi.fn(),storageFrom:vi.fn(),
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 from:(table:string)=>{
  const request={table,filters:[] as [string,unknown][]};mocks.queries.push(request);
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{request.filters.push([key,value]);return q},
   is:(key:string,value:unknown)=>{request.filters.push([key,value]);return q},
   order:async()=>({data:table==='company_documents'?mocks.docs.filter(row=>request.filters.every(([key,value])=>(row[key]??null)===value)):[],error:null}),
   insert:async(payload:unknown)=>{mocks.insert(payload);return {error:mocks.insertError}},
   update:(...args:unknown[])=>{mocks.update(...args);return q},delete:(...args:unknown[])=>{mocks.hardDelete(...args);return q},
  };return q;
 },
 storage:{from:(bucket:string)=>{mocks.storageFrom(bucket);return {upload:async(...args:unknown[])=>{mocks.upload(...args);return {error:mocks.uploadError}},remove:mocks.remove,getPublicUrl:mocks.getPublicUrl,createSignedUrl:mocks.createSignedUrl}}},
 rpc:async(name:string,args:any)=>{mocks.rpc(name,args);if(!mocks.rpcError)mocks.docs=mocks.docs.map(doc=>doc.id===args.p_id?{...doc,deleted_at:'2026-10-18T00:00:00Z'}:doc);return {error:mocks.rpcError}},
}}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
vi.mock('@/utils/storageHelpers',()=>({openPrivateFile:mocks.openPrivateFile}));

describe('company document persistence boundaries',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();mocks.docs=[{...documentRecord}];mocks.queries=[];mocks.uploadError=null;mocks.insertError=null;mocks.rpcError=null;
  vi.spyOn(globalThis.crypto,'randomUUID').mockReturnValue(fileId);
  vi.spyOn(console,'error').mockImplementation(()=>undefined);
 });
 afterEach(()=>vi.restoreAllMocks());
 async function open(){const hook=renderHook(()=>useCompanyDetailManager('organization-synthetic'));await act(async()=>{await hook.result.current.openCompanyDetail(company)});return hook}
 it('uploads a new private UUID object without persisting temporary or public URLs',async()=>{
  const {result}=await open();const file=new File(['bytes'],'Контракт.PDF',{type:'application/pdf'});
  await act(async()=>{await result.current.uploadDocument(file,'contract',companyId)});
  expect(mocks.storageFrom).toHaveBeenCalledWith('company-documents');
  expect(mocks.upload).toHaveBeenCalledWith(`${companyId}/${fileId}.pdf`,file,{upsert:false});
  expect(mocks.insert).toHaveBeenCalledWith({company_id:companyId,type:'contract',name:file.name,file_url:null,file_path:`${companyId}/${fileId}.pdf`,file_size:file.size});
  expect(mocks.getPublicUrl).not.toHaveBeenCalled();expect(mocks.createSignedUrl).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
  expect(result.current.isUploadingDocument).toBeNull();expect(mocks.success).toHaveBeenCalledWith('Документ загружен');
 });
 it('normalizes an unsafe extension while retaining the original display name',async()=>{
  const {result}=await open();const file=new File(['bytes'],'Contract.unsafe extension');
  await act(async()=>{await result.current.uploadDocument(file,'other',companyId)});
  expect(mocks.upload).toHaveBeenCalledWith(`${companyId}/${fileId}.bin`,file,{upsert:false});
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({name:file.name,file_path:`${companyId}/${fileId}.bin`}));
 });
 it('never inserts a document row after upload failure',async()=>{
  const {result}=await open();mocks.uploadError={message:'Storage rejected the upload'};
  await act(async()=>{await result.current.uploadDocument(new File(['bytes'],'new.pdf'),'contract',companyId)});
  expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();
  expect(result.current.companyDocuments).toEqual([documentRecord]);expect(result.current.isUploadingDocument).toBeNull();expect(mocks.error).toHaveBeenCalled();
 });
 it('preserves the uploaded blob and old record when the database commit fails',async()=>{
  const {result}=await open();mocks.insertError={message:'Database unavailable'};
  await act(async()=>{await result.current.uploadDocument(new File(['bytes'],'new.pdf'),'contract',companyId)});
  expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.insert).toHaveBeenCalledOnce();expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.hardDelete).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
  expect(result.current.companyDocuments).toEqual([documentRecord]);expect(mocks.success).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalled();
 });
 it('removes only the registry entry through the guarded soft-delete RPC',async()=>{
  const {result}=await open();await act(async()=>{await result.current.deleteDocument(documentRecord)});
  expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_document',{p_table:'company_documents',p_id:documentRecord.id});
  expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.hardDelete).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
  expect(result.current.companyDocuments).toEqual([]);expect(result.current.isDeletingDocument).toBeNull();
 });
 it('retains the visible document and blob when soft deletion is rejected',async()=>{
  const {result}=await open();mocks.rpcError={message:'Permission denied'};
  await act(async()=>{await result.current.deleteDocument(documentRecord)});
  expect(result.current.companyDocuments).toEqual([documentRecord]);expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.hardDelete).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalled();
 });
 it('all document refreshes explicitly exclude soft-deleted rows',async()=>{
  mocks.docs.push({...documentRecord,id:'document-deleted',deleted_at:'2026-10-17T00:00:00Z'});
  const {result}=await open();await act(async()=>{await result.current.refreshDocuments(companyId)});
  expect(result.current.companyDocuments.map(doc=>doc.id)).toEqual([documentRecord.id]);
  const reads=mocks.queries.filter(query=>query.table==='company_documents');expect(reads.length).toBeGreaterThan(0);
  for(const query of reads)expect(query.filters).toEqual(expect.arrayContaining([['company_id',companyId],['deleted_at',null]]));
 });
});

describe('company cabinet legacy private downloads',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.queries=[];mocks.openPrivateFile.mockResolvedValue(true)});
 it.each(['public','sign','authenticated'])('reopens a file_url-only %s locator through current private authorization',async mode=>{
  const url=`https://project.invalid/storage/v1/object/${mode}/company-documents/${companyId}/contract.pdf${mode==='sign'?'?token=expired-old-token':''}`;
  mocks.docs=[{...documentRecord,file_path:null,file_url:url}];render(<CompanyDocumentsTab companyId={companyId}/>);
  const row=await screen.findByRole('row',{name:/Existing contract/});
  fireEvent.click(within(row).getByRole('button'));
  await waitFor(()=>expect(mocks.openPrivateFile).toHaveBeenCalledWith('company-documents',url));
  expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  expect(mocks.queries.find(query=>query.table==='company_documents')?.filters).toContainEqual(['deleted_at',null]);
 });
 it('keeps an actual external HTTPS attachment as an external link',async()=>{
  const url='https://external.invalid/document.pdf';mocks.docs=[{...documentRecord,file_path:null,file_url:url}];render(<CompanyDocumentsTab companyId={companyId}/>);
  const row=await screen.findByRole('row',{name:/Existing contract/});expect(within(row).getByRole('link')).toHaveAttribute('href',url);expect(mocks.openPrivateFile).not.toHaveBeenCalled();
 });
});
