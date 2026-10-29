import { useLayoutEffect,useRef,useState } from "react";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { openSelectedPdf,type SelectedPdfSession,type VerifiedPdfBytesLease } from "@/lib/selectedPdfCanvas";

export function VerifiedPdfCanvas({lease,title}:{lease:VerifiedPdfBytesLease;title:string}) {
  const identity=useRef({lease,version:0});if(identity.current.lease!==lease)identity.current={lease,version:identity.current.version+1};const scope=identity.current;
  const [selection,setSelection]=useState({scope,page:1});const page=selection.scope===scope?selection.page:1;
  const [snapshot,setSnapshot]=useState<{scope:typeof scope;page:number;state:"loading"|"ready"|"held";pages:number}|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null);const active=useRef<{scope:typeof scope;abort:AbortController;session:SelectedPdfSession|null}|null>(null);
  const current=()=>identity.current===scope&&active.current?.scope===scope&&!active.current.abort.signal.aborted;
  useLayoutEffect(()=>{
    const request={scope,abort:new AbortController(),session:null as SelectedPdfSession|null};active.current=request;
    const requestCurrent=()=>identity.current===scope&&active.current===request&&!request.abort.signal.aborted;
    const stop=()=>{request.abort.abort();request.session?.close();request.session=null;if(canvas.current){canvas.current.width=0;canvas.current.height=0;}if(active.current===request)setSnapshot({scope,page:1,state:"held",pages:0});};
    const visibility=()=>{if(document.visibilityState!=="visible")stop();};
    window.addEventListener("focus",stop);document.addEventListener("visibilitychange",visibility);
    setSnapshot({scope,page:1,state:"loading",pages:0});
    void openSelectedPdf(lease,request.abort.signal).then(session=>{if(!requestCurrent()){session.close();return;}request.session=session;setSnapshot({scope,page:0,state:"loading",pages:session.pages});}).catch(()=>{if(requestCurrent())setSnapshot({scope,page:1,state:"held",pages:0});});
    return()=>{window.removeEventListener("focus",stop);document.removeEventListener("visibilitychange",visibility);stop();if(active.current===request)active.current=null;};
  },[scope,lease]);
  const session=active.current?.scope===scope?active.current.session:null;
  useLayoutEffect(()=>{
    if(!session||!canvas.current||!current())return;const target=canvas.current;const abort=new AbortController();let live=true;
    setSnapshot({scope,page,state:"loading",pages:session.pages});
    void session.render(target,page,abort.signal).then(()=>{if(live&&current())setSnapshot({scope,page,state:"ready",pages:session.pages});}).catch(()=>{if(live&&current())setSnapshot({scope,page,state:"held",pages:session.pages});});
    return()=>{live=false;abort.abort();target.width=0;target.height=0;};
  },[scope,page,session]);
  const view=snapshot?.scope===scope?snapshot:null;const ready=view?.page===page&&view.state==="ready";
  const select=(next:number)=>{if(current()&&ready&&view&&next>=1&&next<=view.pages)setSelection({scope,page:next});};
  return <div className="w-full h-full flex flex-col" aria-label={title}>
    <div className="flex items-center justify-center gap-3 p-2 border-b border-border">
      <Button type="button" size="sm" variant="outline" disabled={!ready||page===1} onClick={()=>select(page-1)}>Назад</Button>
      <span className="text-xs text-muted-foreground">{view&&view.pages>0?"Страница "+page+" из "+view.pages:"PDF · сохранённая редакция"}</span>
      <Button type="button" size="sm" variant="outline" disabled={!ready||!view||page>=view.pages} onClick={()=>select(page+1)}>Далее</Button>
    </div>
    <div className="flex-1 overflow-auto relative flex justify-center p-2">
      <canvas ref={canvas} key={scope.version+":"+page} role="img" aria-label={title+" · страница "+page} className={ready?"max-w-full h-auto self-start":"hidden"}/>
      {view?.state==="held"?<p role="status" className="text-sm text-muted-foreground text-center p-8">Безопасный предпросмотр PDF пока недоступен. Закройте файл и проверьте редакцию ещё раз.</p>:!ready?<div role="status" className="flex items-center gap-3"><SigmaSpinner size="lg"/><p className="text-sm text-muted-foreground">Готовлю безопасный предпросмотр PDF…</p></div>:null}
    </div>
  </div>;
}
