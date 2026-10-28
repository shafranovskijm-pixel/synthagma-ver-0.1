import { AnnotationMode, PDFWorker, VerbosityLevel, getDocument } from "pdfjs-dist-sealed/legacy/build/pdf.mjs";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist-sealed/types/src/display/api";
import type { ExactPlatformCourseFileLease } from "@/lib/exactPlatformCourseFile";

export const SELECTED_PDF_LIMITS = Object.freeze({ bytes:8*1024*1024, pages:500, pixels:4_000_000, dimension:4096, loadMs:20_000, renderMs:10_000 });
export class SelectedPdfUnavailable extends Error { constructor(){super("Безопасный предпросмотр PDF недоступен");this.name="SelectedPdfUnavailable";} }
function unavailable():never { throw new SelectedPdfUnavailable(); }
export function selectedPdfDimensions(width:number,height:number) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)unavailable();
  const scale=Math.min(1.5,SELECTED_PDF_LIMITS.dimension/width,SELECTED_PDF_LIMITS.dimension/height,Math.sqrt(SELECTED_PDF_LIMITS.pixels/(width*height)));
  const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
  if(!Number.isFinite(scale)||scale<=0||w>SELECTED_PDF_LIMITS.dimension||h>SELECTED_PDF_LIMITS.dimension||w*h>SELECTED_PDF_LIMITS.pixels)unavailable();
  return {scale,width:w,height:h};
}
// PDF.js can allocate temporary image canvases in addition to the one visible page.
class BoundedCanvasFactory {
  create(width:number,height:number) { this.check(width,height);const canvas=document.createElement("canvas");canvas.width=Math.ceil(width);canvas.height=Math.ceil(height);const context=canvas.getContext("2d");if(!context)unavailable();return{canvas,context}; }
  reset(target:{canvas:HTMLCanvasElement},width:number,height:number) {this.check(width,height);target.canvas.width=Math.ceil(width);target.canvas.height=Math.ceil(height);}
  destroy(target:{canvas:HTMLCanvasElement|null;context:CanvasRenderingContext2D|null}) {if(target.canvas){target.canvas.width=0;target.canvas.height=0;}target.canvas=null;target.context=null;}
  private check(width:number,height:number) {if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||Math.ceil(width)>SELECTED_PDF_LIMITS.dimension||Math.ceil(height)>SELECTED_PDF_LIMITS.dimension||Math.ceil(width)*Math.ceil(height)>SELECTED_PDF_LIMITS.pixels)unavailable();}
}
export interface SelectedPdfSession {readonly pages:number;render(canvas:HTMLCanvasElement,page:number,signal:AbortSignal):Promise<void>;close():void;}
/** Already verified memory only. No file URL, range transport, viewer, annotation
 * layer, scripting manager, global worker configuration or network fallback. */
export async function openSelectedPdf(lease:ExactPlatformCourseFileLease,signal:AbortSignal):Promise<SelectedPdfSession> {
  if(lease.previewKind!=="pdf"||lease.mime!=="application/pdf")unavailable();
  signal.throwIfAborted();const bytes=lease.copyVerifiedPdfBytes();
  if(bytes.byteLength<=0||bytes.byteLength>SELECTED_PDF_LIMITS.bytes)unavailable();
  const abort=new AbortController();let worker:Worker|null=null,pdfWorker:PDFWorker|null=null,loading:PDFDocumentLoadingTask|null=null,doc:PDFDocumentProxy|null=null,renderTask:RenderTask|null=null,closed=false;
  const close=()=>{if(closed)return;closed=true;abort.abort();renderTask?.cancel();renderTask=null;void loading?.destroy().catch(()=>{});pdfWorker?.destroy();worker?.terminate();try{bytes.fill(0);}catch{/* PDF.js transfers this buffer to the owned worker. */}signal.removeEventListener("abort",close);};
  signal.addEventListener("abort",close,{once:true});
  const bounded=async<T,>(promise:Promise<T>,timeout:number,extra?:AbortSignal):Promise<T>=>{
    let reject!:(reason:unknown)=>void;const interrupted=new Promise<never>((_yes,no)=>{reject=no;});
    const cancel=()=>{close();reject(new SelectedPdfUnavailable());};
    const timer=setTimeout(cancel,timeout);abort.signal.addEventListener("abort",cancel,{once:true});extra?.addEventListener("abort",cancel,{once:true});
    try{if(closed||signal.aborted||extra?.aborted)unavailable();const value=await Promise.race([promise,interrupted]);if(closed||signal.aborted||extra?.aborted)unavailable();return value;}
    finally{clearTimeout(timer);abort.signal.removeEventListener("abort",cancel);extra?.removeEventListener("abort",cancel);}
  };
  class NoExternalPdfResources {async fetch():Promise<never>{close();return unavailable();}}
  try {
    // Explicit port skips PDF.js automatic worker creation and its fake/CDN fallback.
    worker=new Worker(new URL("./selectedPdf.worker.ts",import.meta.url),{type:"module",name:"sintagma-selected-pdf"});
    worker.addEventListener("error",close,{once:true});worker.addEventListener("messageerror",close,{once:true});
    pdfWorker=PDFWorker.create({port:worker,verbosity:VerbosityLevel.ERRORS});
    loading=getDocument({data:bytes,worker:pdfWorker,verbosity:VerbosityLevel.ERRORS,
      BinaryDataFactory:NoExternalPdfResources,CanvasFactory:BoundedCanvasFactory,
      useWorkerFetch:false,useWasm:false,enableXfa:false,stopAtErrors:true,
      disableFontFace:true,useSystemFonts:true,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,
      maxImageSize:SELECTED_PDF_LIMITS.pixels,canvasMaxAreaInBytes:SELECTED_PDF_LIMITS.pixels*4,
      disableRange:true,disableStream:true,disableAutoFetch:true,enableHWA:false});
    loading.onPassword=()=>close();
    doc=await bounded(loading.promise,SELECTED_PDF_LIMITS.loadMs);
    if(!Number.isSafeInteger(doc.numPages)||doc.numPages<=0||doc.numPages>SELECTED_PDF_LIMITS.pages||doc.isPureXfa)unavailable();
    const document=doc;
    return Object.freeze({pages:document.numPages,close,async render(canvas:HTMLCanvasElement,pageNumber:number,cancellation:AbortSignal){
      if(closed||!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>document.numPages||renderTask)unavailable();
      try{
        const page=await bounded(document.getPage(pageNumber),SELECTED_PDF_LIMITS.renderMs,cancellation);
        const base=page.getViewport({scale:1});const size=selectedPdfDimensions(base.width,base.height);const viewport=page.getViewport({scale:size.scale});
        if(closed||cancellation.aborted)unavailable();canvas.width=size.width;canvas.height=size.height;
        renderTask=page.render({canvas,viewport,annotationMode:AnnotationMode.DISABLE,isEditing:false});
        await bounded(renderTask.promise,SELECTED_PDF_LIMITS.renderMs,cancellation);renderTask=null;page.cleanup();
      }catch{canvas.width=0;canvas.height=0;close();throw new SelectedPdfUnavailable();}
    }});
  } catch {close();throw new SelectedPdfUnavailable();}
}
