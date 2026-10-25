import {expect,it,vi} from 'vitest';
const effects=vi.hoisted(()=>({storage:vi.fn(),from:vi.fn(),stamp:vi.fn(),render:vi.fn(),watermark:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:effects.storage,from:effects.from}}));
vi.mock('pdf-lib',()=>({PDFDocument:{create:async()=>({registerFontkit(){},embedFont:async()=>({}),getPageCount:()=>1,save:async()=>new Uint8Array([37,80,68,70])})}}));
vi.mock('@pdf-lib/fontkit',()=>({default:{}}));
vi.mock('../pdfStampDrawer',()=>({appendStampPage:effects.stamp,appendImagePage:vi.fn(),appendAcceptedEditsListPage:vi.fn(),applyWatermarkToAllPages:effects.watermark}));
vi.mock('../htmlToPdfPages',()=>({appendHtmlAsRenderedPages:effects.render}));
import {generateSignedPdf} from '../signedDocumentPdf.ts';
it('builds a local copy without any Storage, database, evidence or signing mutation',async()=>{
 const fetch=vi.fn(async()=>({ok:true,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(1)}));vi.stubGlobal('fetch',fetch);const create=vi.fn(()=> 'blob:local-copy');vi.stubGlobal('URL',class{static createObjectURL=create});
 try{
  const result=await generateSignedPdf({signatureId:'synthetic-signature',documentTitle:'Synthetic document',documentHtml:'<p>Synthetic content</p>',signatureMethod:'pep'});
  expect(result).toEqual({path:'',url:'blob:local-copy',localCopy:true});expect(create).toHaveBeenCalledWith(expect.any(Blob));expect(effects.render).toHaveBeenCalled();expect(effects.stamp).toHaveBeenCalled();expect(effects.storage).not.toHaveBeenCalled();expect(effects.from).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals()}
});
it('refuses a stamp-only copy when no original document body is available',async()=>{
 await expect(generateSignedPdf({signatureId:'synthetic',documentTitle:'Synthetic',signatureMethod:'pep'})).rejects.toThrow('содержимое');
});
it('does not silently replace a corrupt original PDF with blank pages and stamps',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(1)})));const stampCount=effects.stamp.mock.calls.length;
 try{await expect(generateSignedPdf({signatureId:'synthetic',documentTitle:'Synthetic',attachedFileUrl:'https://safe.invalid/corrupt.pdf',attachedFileMime:'application/pdf',signatureMethod:'pep'})).rejects.toThrow('повреждён');expect(effects.stamp).toHaveBeenCalledTimes(stampCount)}finally{vi.unstubAllGlobals()}
});
it('fails the copy when the required signed scan cannot be read',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:403})));const stampCount=effects.stamp.mock.calls.length;
 try{await expect(generateSignedPdf({signatureId:'synthetic',documentTitle:'Synthetic',documentHtml:'<p>Body</p>',scanFileUrl:'https://safe.invalid/scan.pdf',signatureMethod:'handwritten_scan'})).rejects.toThrow('сохранённый скан');expect(effects.stamp).toHaveBeenCalledTimes(stampCount)}finally{vi.unstubAllGlobals()}
});
it('requires a stored scan for a handwritten-signature copy',async()=>{await expect(generateSignedPdf({signatureId:'synthetic',documentTitle:'Synthetic',documentHtml:'<p>Body</p>',signatureMethod:'handwritten_scan'})).rejects.toThrow('скан отсутствует')});
it('stops before the next private scan GET and final handoff if scope changes during HTML rendering',async()=>{
 let finish!:()=>void,current=true;effects.render.mockImplementationOnce(()=>new Promise<void>(r=>{finish=r}));
 const request=vi.fn<(_input: RequestInfo | URL, _init?: RequestInit) => Promise<{ ok: boolean; headers: Headers; arrayBuffer: () => Promise<ArrayBuffer> }>>(async()=>({ok:true,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(1)}));vi.stubGlobal('fetch',request);
 try{
  const result=generateSignedPdf({signatureId:'synthetic',documentTitle:'Synthetic',documentHtml:'<p>Body</p>',scanFileUrl:'https://safe.invalid/private-scan.pdf',signatureMethod:'handwritten_scan',assertCurrent:()=>{if(!current)throw new Error('scope changed')}});
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));current=false;finish();
  await expect(result).rejects.toThrow('scope changed');expect(request.mock.calls.some(c=>c[0]==='https://safe.invalid/private-scan.pdf')).toBe(false);
 }finally{vi.unstubAllGlobals()}
});
