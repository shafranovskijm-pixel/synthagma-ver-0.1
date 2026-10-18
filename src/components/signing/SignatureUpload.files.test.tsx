import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),upload:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('@/lib/signatureFileUpload',()=>({uploadImmutableSignatureFile:mocks.upload}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
vi.mock('@/components/ui/dialog',()=>Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription','DialogFooter'].map(key=>[key,({children}:any)=><div>{children}</div>])));
import {ExternalContractUploader} from './ExternalContractUploader';
import {SignatureRevisionUploader} from './SignatureRevisionUploader';
const org='00000000-0000-4000-8000-000000000100',signature='00000000-0000-4000-8000-000000000010',old='00000000-0000-4000-8000-000000000012';
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.upload.mockResolvedValue(undefined);mocks.rpc.mockImplementation(async(_name,args)=>({data:args.p_revision_id??args.p_signature_id,error:null}));vi.spyOn(console,'error').mockImplementation(()=>{})});
function selectFile(container:HTMLElement){const file=new File(['Synthetic contract'],'synthetic.pdf',{type:'application/pdf'});fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[file]}});return file}
it('creates an initial signature UUID before immutable upload and commits the exact canonical key with v2',async()=>{
 const sent=vi.fn();const {container}=render(<ExternalContractUploader open onOpenChange={()=>{}} organizationId={org} onSent={sent}/>);const file=selectFile(container);fireEvent.click(screen.getByRole('button',{name:'Отправить на согласование'}));
 await waitFor(()=>expect(sent).toHaveBeenCalledOnce());const [name,args]=mocks.rpc.mock.calls[0];expect(name).toBe('create_external_contract_signature_v2');expect(args.p_signature_id).toMatch(/^[0-9a-f-]{36}$/);expect(args.p_file_url).toMatch(new RegExp(`^${org}/signature-files/${args.p_signature_id}/[0-9a-f-]{36}\\.pdf$`));expect(mocks.upload).toHaveBeenCalledWith(args.p_file_url,file);expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);expect(sent).toHaveBeenCalledWith(args.p_signature_id);
});
it('reuses the initial UUID, uploaded object and exact request after a lost commit response',async()=>{
 mocks.rpc.mockImplementationOnce(async()=>({data:null,error:new Error('Synthetic lost response')}));const sent=vi.fn();const {container}=render(<ExternalContractUploader open onOpenChange={()=>{}} organizationId={org} onSent={sent}/>);selectFile(container);const button=screen.getByRole('button',{name:'Отправить на согласование'});fireEvent.click(button);await waitFor(()=>expect(mocks.error).toHaveBeenCalled());fireEvent.click(button);await waitFor(()=>expect(sent).toHaveBeenCalled());expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
});
it.each([null,'other-signature'])('does not report success for an unconfirmed initial commit result %s',async data=>{
 mocks.rpc.mockResolvedValue({data,error:null});const sent=vi.fn();const {container}=render(<ExternalContractUploader open onOpenChange={()=>{}} organizationId={org} onSent={sent}/>);selectFile(container);fireEvent.click(screen.getByRole('button',{name:'Отправить на согласование'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalled());expect(sent).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();
});
it('does not commit a revision if immutable upload failed',async()=>{
 mocks.upload.mockRejectedValue(new Error('Synthetic upload failure'));const {container}=render(<SignatureRevisionUploader open onOpenChange={()=>{}} signatureId={signature} organizationId={org} expectedRevisionId={old}/>);selectFile(container);fireEvent.click(screen.getByRole('button',{name:'Отправить'}));await waitFor(()=>expect(mocks.error).toHaveBeenCalled());expect(mocks.rpc).not.toHaveBeenCalled();
});
it('reuses one revision UUID and exact expected parent version after a lost response',async()=>{
 mocks.rpc.mockImplementationOnce(async()=>({data:null,error:new Error('Synthetic lost response')}));const uploaded=vi.fn();const {container}=render(<SignatureRevisionUploader open onOpenChange={()=>{}} signatureId={signature} organizationId={org} expectedRevisionId={old} onUploaded={uploaded}/>);selectFile(container);const button=screen.getByRole('button',{name:'Отправить'});fireEvent.click(button);await waitFor(()=>expect(mocks.error).toHaveBeenCalled());fireEvent.click(button);await waitFor(()=>expect(uploaded).toHaveBeenCalled());expect(mocks.upload).toHaveBeenCalledOnce();const [name,args]=mocks.rpc.mock.calls[0];expect(name).toBe('add_signature_revision_v2');expect(args).toMatchObject({p_signature_id:signature,p_expected_revision_id:old});expect(args.p_file_url).toBe(`${org}/signature-files/${signature}/${args.p_revision_id}.pdf`);expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);expect(uploaded).toHaveBeenCalledWith(args.p_revision_id);
});
