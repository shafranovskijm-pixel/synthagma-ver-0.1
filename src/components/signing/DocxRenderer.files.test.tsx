import {beforeEach,expect,it,vi} from 'vitest';
import {render,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),storage:vi.fn(),convert:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc,storage:{from:mocks.storage},auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-user'},access_token:'original-jwt'}},error:null}),getUser:async()=>({data:{user:{id:'synthetic-user'}},error:null})}}}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'synthetic-user',revision:1}),captureOfflineAuthRevision:()=>1,isOfflineActorCurrent:(id:string,revision:number)=>id==='synthetic-user'&&revision===1}));
vi.mock('mammoth/mammoth.browser',()=>({convertToHtml:mocks.convert}));
import {DocxRenderer} from './DocxRenderer';
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.convert.mockResolvedValue({value:'<p>Synthetic DOCX content</p>'});mocks.rpc.mockReturnValue({setHeader:vi.fn().mockResolvedValue({error:null})});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,headers:new Headers({'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),arrayBuffer:async()=>new Uint8Array([0x50,0x4b,0x03,0x04]).buffer})))});
it('renders broker DOCX bytes without authenticated Storage or automatic readonly revision writes',async()=>{
 const ready=vi.fn();render(<DocxRenderer fileUrl="https://safe.invalid/short-lived-docx" storagePath={null} revisionId="synthetic-revision" cacheConvertedHtml={false} onHtmlReady={ready}/>);
 await waitFor(()=>expect(ready).toHaveBeenCalledWith('<div class="docx-content"><p>Synthetic DOCX content</p></div>'));expect(fetch).toHaveBeenCalledWith('https://safe.invalid/short-lived-docx',expect.objectContaining({signal:expect.any(AbortSignal),credentials:'omit',referrerPolicy:'no-referrer'}));expect(mocks.storage).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not publish converted private HTML or write a cache after a late scope change',async()=>{
 let resolve!:(value:any)=>void,current=true;mocks.convert.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 const ready=vi.fn();render(<DocxRenderer fileUrl="https://safe.invalid/private.docx" revisionId="synthetic-revision" cacheConvertedHtml onHtmlReady={ready} readOptions={{assertCurrent:()=>{if(!current)throw new Error('old scope')}}}/>);
 await waitFor(()=>expect(resolve).toBeTypeOf('function'));current=false;resolve({value:'<p>Private old content</p>'});
 await waitFor(()=>expect(document.body.textContent).not.toContain('Конвертация документа'));
 expect(ready).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('preserves the explicit authenticated pending-review conversion cache contract',async()=>{
 render(<DocxRenderer fileUrl="https://safe.invalid/docx" revisionId="synthetic-revision" cacheConvertedHtml onHtmlReady={()=>{}}/>);
 await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('update_signature_revision_html',{p_revision_id:'synthetic-revision',p_html:'<div class="docx-content"><p>Synthetic DOCX content</p></div>'}));
});
it('honors the caller abort signal before a scoped private GET starts',async()=>{
 const controller=new AbortController();controller.abort();const ready=vi.fn();
 render(<DocxRenderer fileUrl="https://safe.invalid/private.docx" cacheConvertedHtml={false} onHtmlReady={ready} readOptions={{signal:controller.signal}}/>);
 await waitFor(()=>expect(document.body.textContent).toContain('отменено'));
 expect(fetch).not.toHaveBeenCalled();expect(mocks.convert).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
