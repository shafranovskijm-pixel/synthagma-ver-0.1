// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upload:vi.fn(),download:vi.fn(),remove:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>mocks}}}));
import {uploadImmutableSignatureFile} from '../signatureFileUpload.ts';
const path='tenant/signature-files/signature/synthetic.pdf',file=new File(['Synthetic bytes'],'synthetic.pdf',{type:'application/pdf'});
beforeEach(()=>{vi.clearAllMocks();mocks.upload.mockResolvedValue({error:null});mocks.download.mockResolvedValue({data:new Blob(['Synthetic bytes']),error:null})});
it('uploads insert-only and never deletes or overwrites',async()=>{await uploadImmutableSignatureFile(path,file);expect(mocks.upload).toHaveBeenCalledWith(path,file,{contentType:file.type,upsert:false});expect(mocks.download).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled()});
it('reconciles a lost upload response using exact owned object bytes',async()=>{mocks.upload.mockResolvedValue({error:{message:'Synthetic conflict or lost response'}});await uploadImmutableSignatureFile(path,file);expect(mocks.download).toHaveBeenCalledWith(path);expect(mocks.remove).not.toHaveBeenCalled()});
it.each([new Blob(['Different bytes']),null])('rejects a conflicting or unreadable object without replacing it',async data=>{mocks.upload.mockResolvedValue({error:{message:'Synthetic conflict'}});mocks.download.mockResolvedValue({data,error:null});await expect(uploadImmutableSignatureFile(path,file)).rejects.toThrow('существующий файл не изменён');expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.upload).toHaveBeenCalledOnce()});
