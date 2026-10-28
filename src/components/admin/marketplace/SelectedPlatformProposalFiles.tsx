import { useEffect,useRef,useState } from "react";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type { PublicationReviewContext } from "@/lib/platformCoursePublication";
import { selectedPlatformFileFromReview,type SelectedPlatformFileReference } from "@/lib/exactPlatformCourseFile";
import { useExactPlatformCourseFile } from "@/hooks/useExactPlatformCourseFile";
export function SelectedPlatformProposalFiles({context,scopeVersion,enabled,isCurrentContext}:{
  context:PublicationReviewContext;scopeVersion:number;enabled:boolean;
  isCurrentContext:(context:PublicationReviewContext)=>boolean;
}) {
  const scopeRef=useRef({context,scopeVersion,enabled});
  if(scopeRef.current.context!==context||scopeRef.current.scopeVersion!==scopeVersion||scopeRef.current.enabled!==enabled)scopeRef.current={context,scopeVersion,enabled};
  const scope=scopeRef.current;
  const mounted=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [selected,setSelected]=useState<{scope:typeof scope;target:Readonly<SelectedPlatformFileReference>;label:string}|null>(null);
  const [failed,setFailed]=useState<typeof scope|null>(null);
  const current=()=>mounted.current&&scopeRef.current===scope&&enabled&&isCurrentContext(context);
  const chosen=selected?.scope===scope&&enabled&&isCurrentContext(context)?selected:null;
  const file=useExactPlatformCourseFile(chosen?.target??null,!!chosen);
  if(!context.proposal)return null;
  const references=context.proposal.source.fileBindings;
  const open=(kind:typeof references[number]["kind"],referenceId:string,label:string)=>{
    if(!current())return;
    try{const target=selectedPlatformFileFromReview(context,kind,referenceId);if(current()){setFailed(null);setSelected({scope,target,label});}}
    catch{if(current())setFailed(scope);}
  };
  return <section className="space-y-2 rounded-lg border p-3" aria-label="Файлы сохранённого досье">
    <h4 className="text-sm font-semibold">Файлы сохранённого досье</h4>
    <p className="text-xs text-muted-foreground">Проверяйте файлы этой сохранённой редакции. Решение о готовности оформляется отдельным действием.</p>
    {references.length===0?<p className="text-sm text-muted-foreground">В выбранном досье ссылки на файлы не зафиксированы.</p>:<div className="flex flex-wrap gap-2">{references.map((ref,index)=>{
      const label=(ref.kind==="course_document"?"Документ ":"Вложение ")+String(index+1);
      return <Button key={ref.kind+":"+ref.referenceId+":"+index} type="button" variant="outline" size="sm" disabled={!enabled} onClick={()=>open(ref.kind,ref.referenceId,label)}>{label}</Button>;
    })}</div>}
    {failed===scope&&<p role="status" className="text-sm text-muted-foreground">Связь файла с выбранным досье не подтверждена.</p>}
    {chosen&&<Dialog open onOpenChange={open=>{if(!open&&scopeRef.current===scope)setSelected(null);}}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border"><DialogTitle className="text-base font-medium truncate pr-4">{chosen.label} · сохранённая редакция</DialogTitle></DialogHeader>
        <div className="flex-1 relative overflow-hidden bg-muted/30">
          {file.view.state==="loading"?<div className="absolute inset-0 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><SigmaSpinner size="lg"/><p className="text-sm text-muted-foreground">Подтверждаю точную редакцию файла…</p></div></div>
            :file.view.state==="exact"&&file.view.lease.previewKind==="pdf"?<iframe src={file.view.lease.url} title={chosen.label} sandbox="" referrerPolicy="no-referrer" className="w-full h-full border-0"/>
            :file.view.state==="exact"&&file.view.lease.previewKind==="image"?<img src={file.view.lease.url} alt={chosen.label} className="w-full h-full object-contain"/>
            :<div className="flex flex-col items-center justify-center h-full gap-4 p-8"><p role="status" className="text-sm text-muted-foreground text-center">Зафиксированная версия для этого файла или безопасный предпросмотр пока не подтверждены.</p><Button type="button" variant="outline" onClick={()=>{if(current())file.refresh();}}>Проверить ещё раз</Button></div>}
        </div>
      </DialogContent>
    </Dialog>}
  </section>;
}
