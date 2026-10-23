import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import { useLayoutEffect } from 'react';
const mocks=vi.hoisted(()=>({file:vi.fn(),storage:vi.fn(),generate:vi.fn(),toast:vi.fn(),legacy:vi.fn(),artifact:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:null,userRole:null})}));
vi.mock('@/lib/signatureTokenFile',()=>({getSignatureTokenFile:mocks.file,getAuthenticatedSignatureFile:mocks.legacy,downloadStoredSignatureArtifact:mocks.artifact,isHistoricalSignatureFileError:(e:any)=>e?.code==='HISTORICAL_FILE_BINDING_UNVERIFIED'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:mocks.storage}}}));
vi.mock('@/lib/signedDocumentPdf',()=>({generateSignedPdf:mocks.generate}));
vi.mock('sonner',()=>({toast:{success:mocks.toast,error:mocks.toast}}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><div>{children}</div>}));
vi.mock('@/components/signing/PepSignatureStamp',()=>({PepSignatureStamp:()=>null}));
import {SignedDocumentPreview} from './SignedDocumentPreview';
const props={open:true,onOpenChange:vi.fn(),signatureId:'synthetic-signature',organizationId:'synthetic-org',signatureToken:'synthetic-private-token',revisionId:'synthetic-revision',documentTitle:'Synthetic',documentHtml:'<p>Synthetic content</p>'};
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.artifact.mockResolvedValue(undefined);mocks.file.mockImplementation(async({kind})=>`https://safe.invalid/${kind}`)});
it('opens token source and scan through the broker without anonymous Storage calls',async()=>{
 render(<SignedDocumentPreview {...props} attachedFilePath="https://old.invalid/expired.pdf" handwrittenScanPath="old-scan.pdf"/>);
 await waitFor(()=>expect(mocks.file).toHaveBeenCalledTimes(2));expect(mocks.file).toHaveBeenCalledWith(expect.objectContaining({token:props.signatureToken,signatureId:props.signatureId,kind:'source',assertCurrent:expect.any(Function),signal:expect.any(AbortSignal)}));expect(mocks.file).toHaveBeenCalledWith(expect.objectContaining({token:props.signatureToken,signatureId:props.signatureId,kind:'scan',assertCurrent:expect.any(Function),signal:expect.any(AbortSignal)}));expect(mocks.storage).not.toHaveBeenCalled();
});
it('retrieves the saved artifact and never rebuilds or overwrites it on download',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new Blob(['synthetic certificate'])})));vi.stubGlobal('URL',class{static createObjectURL=vi.fn(()=>'blob:certificate');static revokeObjectURL=vi.fn()});const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{render(<SignedDocumentPreview {...props} signedDocumentPath="stored-artifact.html"/>);fireEvent.click(screen.getByRole('button',{name:'Скачать сохранённый документ'}));await waitFor(()=>expect(mocks.artifact).toHaveBeenCalledWith(expect.objectContaining({token:props.signatureToken,signatureId:props.signatureId,organizationId:props.organizationId,locator:'stored-artifact.html',assertCurrent:expect.any(Function)})));await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith('Сохранённый документ передан на скачивание'));expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();}
 finally{click.mockRestore();vi.unstubAllGlobals()}
});
it('clearly labels the local fallback as a copy and does not claim a saved original',async()=>{
 render(<SignedDocumentPreview {...props}/>);await waitFor(()=>expect(screen.queryByText('Загрузка документа…')).toBeNull());expect(screen.getByRole('button',{name:'Скачать копию PDF'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Скачать сохранённый документ'})).toBeNull();
});
it('does not report a successful download when artifact fetching fails',async()=>{
 mocks.artifact.mockRejectedValue(new Error('HTTP 403'));
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:403})));const open=vi.spyOn(window,'open').mockImplementation(()=>null);
 try{render(<SignedDocumentPreview {...props} signedDocumentPath="stored.html"/>);fireEvent.click(screen.getByRole('button',{name:'Скачать сохранённый документ'}));await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Не удалось скачать документ')));expect(mocks.toast).not.toHaveBeenCalledWith('Сохранённый документ передан на скачивание');expect(open).not.toHaveBeenCalled();}
 finally{vi.unstubAllGlobals();open.mockRestore()}
});
it('only attempts user-JWT legacy fallback for the explicit historical-binding error',async()=>{
 mocks.file.mockRejectedValueOnce({code:'HISTORICAL_FILE_BINDING_UNVERIFIED'});mocks.legacy.mockResolvedValue('https://safe.invalid/legacy');
 render(<SignedDocumentPreview {...props} attachedFilePath="legacy.pdf"/>);await waitFor(()=>expect(mocks.legacy).toHaveBeenCalledWith('legacy.pdf',props.organizationId,'external-contracts',expect.objectContaining({assertCurrent:expect.any(Function),signal:expect.any(AbortSignal)})));
 cleanup();vi.clearAllMocks();mocks.file.mockRejectedValue(new Error('hash mismatch'));render(<SignedDocumentPreview {...props} attachedFilePath="corrupt.pdf"/>);await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(mocks.legacy).not.toHaveBeenCalled();
});
it('does not revive source URLs from an older document after close/reopen and signature A→B→A',async()=>{
 let resolve!:(url:string)=>void;const pending=new Promise<string>(r=>{resolve=r});mocks.file.mockReturnValueOnce(pending);
 const view=render(<SignedDocumentPreview {...props} attachedFilePath="old-private.pdf"/>);
 await waitFor(()=>expect(mocks.file).toHaveBeenCalled());const first=mocks.file.mock.calls[0][0];
 view.rerender(<SignedDocumentPreview {...props} signatureId="signature-b" attachedFilePath="new-private.pdf"/>);
 view.rerender(<SignedDocumentPreview {...props} open={false} attachedFilePath="old-private.pdf"/>);
 view.rerender(<SignedDocumentPreview {...props} attachedFilePath="old-private.pdf"/>);
 expect(first.signal.aborted).toBe(true);expect(first.assertCurrent).toThrow();
 await act(async()=>{resolve('https://safe.invalid/old-private-result')});
 expect(document.querySelector('iframe[src="https://safe.invalid/old-private-result"]')).toBeNull();
});
it('invalidates the old child file guard in the new parent layout phase before passive unmount cleanup',async()=>{
 let oldGuard:(()=>void)|undefined;const observations:boolean[]=[];
 mocks.file.mockImplementation(async({assertCurrent})=>{oldGuard=assertCurrent;return 'https://safe.invalid/current-source'});
 function Observe({signatureId,open,visible=true}:{signatureId:string;open:boolean;visible?:boolean}){
  useLayoutEffect(()=>{if(oldGuard){try{oldGuard();observations.push(true)}catch{observations.push(false)}}},[signatureId,open,visible]);
  return visible?<SignedDocumentPreview {...props} signatureId={signatureId} open={open} attachedFilePath="private.pdf"/>:null;
 }
 const view=render(<Observe signatureId="signature-a" open/>);await waitFor(()=>expect(oldGuard).toBeTypeOf('function'));
 view.rerender(<Observe signatureId="signature-b" open/>);
 view.rerender(<Observe signatureId="signature-a" open={false}/>);
 view.rerender(<Observe signatureId="signature-a" open/>);
 view.rerender(<Observe signatureId="signature-a" open visible={false}/>);
 expect(observations).toEqual([false,false,false,false]);
});
