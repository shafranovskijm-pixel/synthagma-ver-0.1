import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { createDocumentUploadOperation, saveDocumentUpload, restoreDocumentFile, getOrgDocumentState, isOrgDocumentReady, type OrgDocumentClient } from "../orgDocumentLifecycle";

const make = () => {
  const upload=vi.fn().mockResolvedValue({error:null});
  const remove=vi.fn();
  const rpc=vi.fn().mockImplementation((_name,params)=>Promise.resolve({error:null,data:{
    document_id:params.p_document_id,revision:1,version_id:"version-1",version_number:2,replayed:false,
  }}));
  const client={storage:{from:vi.fn(()=>({upload,remove,getPublicUrl:(path:string)=>({data:{publicUrl:"https://example.supabase.co/storage/v1/object/public/org-documents/"+path}})}))},rpc};
  return {client:client as unknown as OrgDocumentClient,upload,remove,rpc};
};
const operation=()=>createDocumentUploadOperation({organizationId:"org",documentId:"doc",expectedRevision:4,
  file:new File(["new contents"],"документ.pdf",{type:"application/pdf"}),document:{expires_at:null,responsible_person:null}});
describe("document staging and uncertain outcomes",()=>{
  it("does not mutate DB or delete the old file on storage failure",async()=>{
    const m=make();m.upload.mockResolvedValue({error:new Error("Storage unavailable")});
    await expect(saveDocumentUpload(operation(),m.client)).rejects.toThrow("Storage unavailable");
    expect(m.rpc).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
  });
  it("never deletes a blob after an RPC error, including an ambiguous commit timeout",async()=>{
    const m=make();const op=operation();
    m.rpc.mockRejectedValueOnce(new Error("Response lost after commit"));
    await expect(saveDocumentUpload(op,m.client)).rejects.toThrow("Response lost");
    expect(op.staged).toBe(true);expect(m.remove).not.toHaveBeenCalled();
    const first=m.rpc.mock.calls[0][1];
    m.rpc.mockResolvedValueOnce({error:null,data:{document_id:"doc",revision:5,version_id:"v1",version_number:7,replayed:true}});
    expect(await saveDocumentUpload(op,m.client)).toMatchObject({replayed:true});
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(m.rpc.mock.calls[1][1]).toEqual(first);
  });
  it("uses a unique immutable path, explicit null metadata and expected revision",async()=>{
    const m=make();const op=operation();
    await saveDocumentUpload(op,m.client);
    expect(m.upload).toHaveBeenCalledWith(op.path,op.file,{upsert:false,contentType:"application/pdf"});
    expect(op.path).toBe(`org/versions/doc/${op.requestId}.pdf`);
    expect(m.rpc.mock.calls[0][1]).toMatchObject({p_expected_revision:4,p_document:{expires_at:null,responsible_person:null}});
    expect(createDocumentUploadOperation({organizationId:"org",documentId:"doc",file:op.file}).path).not.toBe(op.path);
  });
  it("does not accept an unconfirmed DB result as success or remove staged data",async()=>{
    const m=make();m.rpc.mockResolvedValue({data:null,error:null});
    await expect(saveDocumentUpload(operation(),m.client)).rejects.toThrow("Не удалось подтвердить");
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("restores through an idempotent server event with no storage overwrite",async()=>{
    const m=make();
    await restoreDocumentFile({documentId:"doc",organizationId:"org",requestId:"request",expectedRevision:8,versionId:"old"},m.client);
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls[0][1]).toEqual({p_document_id:"doc",p_organization_id:"org",p_request_id:"request",p_expected_revision:8,p_restore_version_id:"old",p_upload:null,p_document:{}});
  });
});
describe("readiness is a document state, not row existence",()=>{
  const now=new Date(2026,9,18,12);
  it.each([
    [undefined,"none",false],
    [{file_url:null},"fileless",false],
    [{file_url:"  "},"fileless",false],
    [{file_url:"file",deleted_at:"2026-10-17"},"deleted",false],
    [{file_url:"file",status:"archived"},"archived",false],
    [{file_url:"file",status:"expired"},"expired",false],
    [{file_url:"file",status:"draft"},"unconfirmed",false],
    [{file_url:"file",expires_at:"not-a-date"},"unconfirmed",false],
    [{file_url:"file",expires_at:"2026-10-17"},"expired",false],
    [{file_url:"file",expires_at:"2026-10-18"},"expiring",true],
    [{file_url:"file",expires_at:"2027-01-01"},"active",true],
    [{file_url:"file",status:null},"active",true],
  ] as const)("classifies %j as %s", (doc,state,ready)=>{
    expect(getOrgDocumentState(doc,now).state).toBe(state);
    expect(isOrgDocumentReady(doc,now)).toBe(ready);
  });
});

