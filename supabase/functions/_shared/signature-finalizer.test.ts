// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { finalizeSignatureRequest, signatureSha256, signatureSourcePath } from './signature-finalizer';
import { publicVerificationRequest } from './public-document-verifier';
const org='00000000-0000-4000-8000-000000000100', id='00000000-0000-4000-8000-000000000010', revision='00000000-0000-4000-8000-000000000012';
const token='0123456789abcdef0123456789abcdef';
const request=(body: any)=>new Request('https://example.invalid/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const base={token,expectedRevisionId:revision,documentHash:'a'.repeat(64),pepAgreement:{agreement_text:'Accepted synthetic agreement',full_name:'Synthetic Recipient',email:'recipient@example.invalid'}};
function database(options:{rpcError?:string;deleted?:boolean;fileUrl?:string;scan?:Blob;certificateFailed?:boolean}={}){
 const effects={update:vi.fn(),upload:vi.fn(),download:vi.fn(async()=>({data:options.scan??new Blob(['verified file'],{type:'application/pdf'}),error:null}))};
 const q=(table:string)=>{
  const query:any={select:vi.fn(()=>query),eq:vi.fn(()=>query),neq:vi.fn(async()=>({error:null})),
   update:vi.fn((...args:any[])=>{effects.update(...args);return query}),
   maybeSingle:vi.fn(async()=>({data:table==='document_signatures'?{id,organization_id:org,current_revision_id:revision,deleted_at:options.deleted?'2026-10-18':null,status:'in_review'}:{file_url:options.fileUrl??null},error:null})),
  };return query;
 };
 const db={from:vi.fn(q),rpc:vi.fn(async()=>({data:options.rpcError?null:{success:true,signatureId:id,pepAgreementId:'pep-1',signedAt:'2026-10-18T00:00:00Z',certificateState:'pending'},error:options.rpcError?{code:options.rpcError}:null})),storage:{from:vi.fn(()=>({download:effects.download,upload:effects.upload}))}};
 const certificate=vi.fn(async()=>{if(options.certificateFailed)throw new Error('temporary failure')});
 return {db,effects,certificate,run:(body=base)=>finalizeSignatureRequest(request(body),{db,supabaseUrl:'https://safe.supabase.co',generateCertificate:certificate})};
}
describe('atomic signature handler',()=>{
 it('passes current revision to one RPC, without separate PEP insert or signature DML',async()=>{
  const {db,effects,certificate,run}=database(); const result=await run();expect(result.status).toBe(200);
  expect((await result.json()).certificateState).toBe('ready');expect(db.rpc).toHaveBeenCalledWith('uc_finalize_signature',expect.objectContaining({p_expected_revision_id:revision,p_revision_provided:true,p_document_hash:base.documentHash}));
  expect(effects.update).not.toHaveBeenCalled();expect(certificate).toHaveBeenCalledWith(id);expect(result.headers.get('X-Sintagma-Function-Revision')).toBe('uc-foundation-20261018-v1');
 });
 it.each([['40001',409],['55000',410],['42501',403],['P0002',404],['unknown',503]])('fails closed on authoritative %s',async(code,status)=>{
  const {effects,certificate,run}=database({rpcError:code as string});expect((await run()).status).toBe(status);expect(certificate).not.toHaveBeenCalled();expect(effects.update).not.toHaveBeenCalled();
 });
 it('records a retryable certificate failure without falsely claiming ready',async()=>{
  const {effects,run}=database({certificateFailed:true});const response=await run();expect(response.status).toBe(200);expect((await response.json()).certificateState).toBe('failed');expect(effects.update).toHaveBeenCalledWith(expect.objectContaining({certificate_state:'failed'}));
 });
 it('retains hash-based CAS for old PEP clients',async()=>{
  const {run,db}=database();const {expectedRevisionId,...old}=base;await run(old as typeof base);expect(db.rpc).toHaveBeenCalledWith('uc_finalize_signature',expect.objectContaining({p_revision_provided:false,p_document_hash:base.documentHash}));
 });
 it('does not read arbitrary original URLs',async()=>{
  const {run,db,effects}=database({fileUrl:'https://attacker.invalid/private.pdf'});expect((await run()).status).toBe(409);expect(effects.download).not.toHaveBeenCalled();expect(db.rpc).not.toHaveBeenCalled();
 });
 it('hashes the original file from the tenant-owned bucket',async()=>{
  const {run,db}=database({fileUrl:`${org}/original.pdf`});expect((await run()).status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith('uc_finalize_signature',expect.objectContaining({p_source_path:`${org}/original.pdf`,p_source_hash:await signatureSha256(await new Blob(['verified file']).arrayBuffer())}));
 });
 it('rejects a scan from another signature before downloading',async()=>{
  const {run,db,effects}=database();expect((await run({...base,method:'handwritten_scan',handwrittenScanPath:`${org}/signed-scans/wrong.pdf`} as any)).status).toBe(409);expect(db.rpc).not.toHaveBeenCalled();expect(effects.download).not.toHaveBeenCalled();
 });
 it('hashes an immutable scan bound to exact organization and signature',async()=>{
  const {run,db}=database();const scanPath=`${org}/signed-scans/${id}-100.pdf`;expect((await run({...base,method:'handwritten_scan',handwrittenScanPath:scanPath} as any)).status).toBe(200);
  expect(db.rpc).toHaveBeenCalledWith('uc_finalize_signature',expect.objectContaining({p_scan_path:scanPath,p_scan_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
 });
 it('rejects deleted records before finalization',async()=>{const {run,db}=database({deleted:true});expect((await run()).status).toBe(404);expect(db.rpc).not.toHaveBeenCalled()});
 it('rejects a mismatched original tenant and decoded traversal',()=>{
  expect(signatureSourcePath('other/file.pdf',org,'https://safe.supabase.co')).toBeNull();
  expect(signatureSourcePath(`https://safe.supabase.co/storage/v1/object/sign/external-contracts/${org}/%2e%2e%2ffile.pdf`,org,'https://safe.supabase.co')).toBeNull();
 });
});
function verifier(records:any[]){
 const queries:any[]=[];
 const db={from:(table:string)=>{const filters:any[]=[];const q:any={select:()=>q,eq:(key:string,value:any)=>{filters.push([key,value]);return q},is:(key:string,value:any)=>{filters.push([key,value]);return q},
  limit:async(max:number)=>{queries.push(filters);return {data:records.filter(row=>filters.every(([key,value])=>row[key]===value)).slice(0,max),error:null}},
  maybeSingle:async()=>({data:{name:'Synthetic center'},error:null})};return q}};
 return {queries,run:(query:string)=>publicVerificationRequest(new Request(`https://example.invalid/verify?${query}`),()=>db)};
}
const document={id,organization_id:org,reg_number:'1',deleted_at:null,full_name:'Synthetic Recipient',document_status:'original'};
describe('public verification identity and lifecycle',()=>{
 it('preserves unambiguous exact legacy numbers',async()=>{const r=await verifier([document]).run('reg_number=1');expect((await r.json()).valid).toBe(true)});
 it('refuses ambiguous tenant-scoped numbers',async()=>{const r=await verifier([document,{...document,id:revision,organization_id:'other'}]).run('reg_number=1');expect(r.status).toBe(409);expect((await r.json()).code).toBe('AMBIGUOUS_REG_NUMBER')});
 it('resolves the exact immutable document ID despite duplicate numbers',async()=>{const r=await verifier([document,{...document,id:revision,organization_id:'other'}]).run(`document_id=${id}&reg_number=1`);const data=await r.json();expect(data.valid).toBe(true);expect(data.document.id).toBe(id)});
 it('supports organization + exact number',async()=>{const r=await verifier([document,{...document,id:revision,organization_id:'other'}]).run(`organization_id=${org}&reg_number=1`);expect((await r.json()).valid).toBe(true)});
 it.each(['cancelled','invalidated','revoked','unknown'])('never claims %s is valid',async status=>{const r=await verifier([{...document,document_status:status}]).run('reg_number=1');expect((await r.json()).valid).toBe(false)});
 it('excludes deleted documents',async()=>{const r=await verifier([{...document,deleted_at:'2026-10-18'}]).run('reg_number=1');expect((await r.json()).document).toBeUndefined()});
 it('rejects wildcard enumeration without touching database',async()=>{const {run,queries}=verifier([document]);expect((await run('reg_number=%25')).status).toBe(400);expect(queries).toEqual([])});
});
