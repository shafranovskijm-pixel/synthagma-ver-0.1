import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrgDocumentWorkflowPanel } from '@/components/organization/documents/OrgDocumentWorkflowPanel';
import { OrgDocumentVersionsDialog } from '@/components/organization/OrgDocumentVersionsDialog';
import { issuanceScopeCurrent, requireIssuanceScope, normalizeIssuanceError, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import { createScopedOrgDocumentTransport } from '@/lib/programFiles';
import { IssuanceTemplateInputError, listIssuanceTemplateDocuments, readIssuanceTemplateDocument, prepareIssuanceTemplateCreation, type IssuanceTemplateDocument, type PreparedIssuanceTemplateCreation } from '@/lib/educationIssuance/templateCreation';

interface Props {open:boolean;onOpenChange:(open:boolean)=>void;scope:EducationIssuanceScope;canWrite:boolean;onReturnToTemplates:()=>void;}
export function IssuanceTemplateDialog(props:Props){
 const active=useRef({scope:props.scope,open:props.open,canWrite:props.canWrite,revision:0});
 if(active.current.scope!==props.scope||active.current.open!==props.open||active.current.canWrite!==props.canWrite)active.current={scope:props.scope,open:props.open,canWrite:props.canWrite,revision:active.current.revision+1};
 const revision=active.current.revision,mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const scope=useMemo(()=>({...props.scope,current:()=>mounted.current&&active.current.revision===revision&&active.current.open&&active.current.canWrite&&issuanceScopeCurrent(props.scope)}),[props.scope,revision]);
 const ownerKey=JSON.stringify([scope.actorId,scope.organizationId,scope.accessRevision,scope.issuanceScope]);
 const [dataOwner,setDataOwner]=useState({key:ownerKey,revision});
 const [name,setName]=useState(''),[file,setFile]=useState<File|null>(null),[saved,setSaved]=useState<IssuanceTemplateDocument|null>(null);
 const [items,setItems]=useState<IssuanceTemplateDocument[]>([]),[next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[versions,setVersions]=useState(false);
 const selectedKey=JSON.stringify([saved?.id,saved?.current_version_id,versions]),selectedEpoch=useRef({key:selectedKey,revision:0});
 if(selectedEpoch.current.key!==selectedKey)selectedEpoch.current={key:selectedKey,revision:selectedEpoch.current.revision+1};
 const selectedRevision=selectedEpoch.current.revision;
 const sourceDownload=useMemo(()=>({controller:new AbortController(),assertCurrent:()=>{requireIssuanceScope(scope);if(selectedEpoch.current.revision!==selectedRevision)throw new Error('Выбранный шаблон изменился.');}}),[scope,selectedRevision]);
 useEffect(()=>()=>sourceDownload.controller.abort(),[sourceDownload]);
 const sourceTransport=useMemo(()=>createScopedOrgDocumentTransport({
  actorId:scope.actorId,organizationId:scope.organizationId,accessRevision:scope.accessRevision,
  key:JSON.stringify(["issuance-template",ownerKey,revision,selectedRevision,selectedKey]),
  current:()=>{sourceDownload.assertCurrent();return true;},
 },false),[scope,ownerKey,revision,selectedRevision,selectedKey,sourceDownload]);
 const operation=useRef<PreparedIssuanceTemplateCreation|null>(null),flight=useRef(false),sequence=useRef(0);
 const current=props.open&&props.canWrite&&dataOwner.key===ownerKey&&dataOwner.revision===revision&&issuanceScopeCurrent(scope);
 useEffect(()=>{operation.current=null;setName('');setFile(null);setSaved(null);setItems([]);setNext(null);setLoaded(false);setVersions(false);},[ownerKey]);
 useEffect(()=>{++sequence.current;setDataOwner({key:ownerKey,revision});setSaved(null);setItems([]);setNext(null);setLoaded(false);flight.current=false;setBusy(false);setError(null);setVersions(false);if(props.open&&props.canWrite)void load(false);return()=>{++sequence.current;};},[scope]);
 const fail=(cause:unknown)=>cause instanceof IssuanceTemplateInputError?cause.message:normalizeIssuanceError(cause).message;
 async function load(more=false){
  if(!issuanceScopeCurrent(scope)||flight.current)return;
  const run=sequence.current;flight.current=true;setBusy(true);setError(null);
  try{const selectedId=dataOwner.key===ownerKey&&dataOwner.revision===revision?saved?.id:undefined,value=await listIssuanceTemplateDocuments(scope,more?next:null);
   const selected=selectedId?await readIssuanceTemplateDocument(scope,selectedId):null;
   if(run===sequence.current&&issuanceScopeCurrent(scope)){
   setItems(previous=>(more?[...new Map([...previous,...value.items].map(item=>[item.id,item])).values()]:value.items).filter(item=>!selectedId||selected||item.id!==selectedId));setNext(value.next);setLoaded(true);
   if(selectedId){setSaved(previous=>previous?.id===selectedId?selected:previous);if(!selected)setError('Выбранный шаблон сейчас недоступен. Проверьте текущий доступ и версию.');}
  }}catch(cause){if(run===sequence.current&&issuanceScopeCurrent(scope)){setSaved(null);setItems([]);setLoaded(false);setError(fail(cause));}}
  finally{if(run===sequence.current){flight.current=false;setBusy(false);}}
 }
 const save=async()=>{
  if(!current||flight.current||saved)return;
  const run=sequence.current;flight.current=true;setBusy(true);setError(null);
  try{
   const candidate=operation.current??await prepareIssuanceTemplateCreation(scope,name,file!);
   if(run!==sequence.current||!issuanceScopeCurrent(scope))return;
   operation.current=candidate;
   const value=await candidate.run(scope);
   if(run===sequence.current&&issuanceScopeCurrent(scope)){setSaved(value);setItems(previous=>[value,...previous.filter(item=>item.id!==value.id)]);}
  }catch(cause){if(run===sequence.current&&issuanceScopeCurrent(scope))setError(fail(cause));}
  finally{if(run===sequence.current){flight.current=false;setBusy(false);}}
 };
 const choose=(value:IssuanceTemplateDocument)=>{if(!current||busy||operation.current&&!saved&&operation.current.documentId!==value.id)return;setSaved(value);setVersions(false);setError(null);};
 return <><Dialog open={props.open&&!versions} onOpenChange={props.onOpenChange}><DialogContent className="rounded-2xl max-w-3xl max-h-[90vh] overflow-y-auto">
  <DialogHeader><DialogTitle>Шаблоны итоговых документов</DialogTitle><DialogDescription>Новый шаблон сохраняется отдельным документом организации. Файлы устава, приказов и прежних шаблонов сохраняются. Загрузка не означает утверждение или выдачу документа.</DialogDescription></DialogHeader>
  {!current?(dataOwner.key!==ownerKey||dataOwner.revision!==revision?<p role="status" className="text-sm text-muted-foreground">Обновляем контекст шаблонов…</p>:<p role="alert" className="text-sm text-destructive">Текущий доступ к созданию и проверке шаблонов не подтверждён.</p>):<div className="space-y-4">
   {!saved&&<div className="space-y-3 rounded-xl border p-3">
    <Label htmlFor="issuance-template-name">Название нового шаблона</Label><Input id="issuance-template-name" maxLength={200} value={name} onChange={event=>setName(event.target.value)} disabled={busy||!!operation.current}/>
    <Label htmlFor="issuance-template-file">HTML-файл в UTF-8, до 1 МБ</Label><Input id="issuance-template-file" type="file" accept=".html,.htm,text/html" disabled={busy||!!operation.current} onChange={event=>setFile(event.target.files?.[0]??null)}/>
    <p className="text-xs text-muted-foreground">Сохранится исходный файл без изменения байтов. После загрузки выберите участников, передайте версию на проверку и внесите явное внутреннее утверждение. Встроенное текстовое представление очищается для безопасного просмотра; формирование PDF проверяется отдельно.</p>
    <Button disabled={busy||!operation.current&&(!name.trim()||!file)} onClick={()=>void save()}>{busy?'Проверяем и сохраняем…':operation.current?'Повторить то же сохранение':'Сохранить новый шаблон'}</Button>
    {operation.current&&<p className="text-xs text-muted-foreground">При неподтверждённом результате повторяется тот же запрос. Название и файл зафиксированы для этого сохранения.</p>}
   </div>}
   {saved&&<div className="space-y-3 rounded-xl border p-3"><p className="text-sm font-medium">{saved.name}</p><p className="text-xs text-muted-foreground">Открыт самостоятельный документ. Утверждение относится только к выбранной версии и не создаёт электронную подпись.</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={()=>setVersions(true)}>Файлы и версии шаблона</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>{operation.current=null;setSaved(null);setName('');setFile(null);}}>Создать ещё шаблон</Button></div>
    <OrgDocumentWorkflowPanel transport={sourceTransport} sourceOpenMode="download" sourceDownloadSignal={sourceDownload.controller.signal} sourceDownloadAssertCurrent={sourceDownload.assertCurrent} key={saved.id+':'+saved.current_version_id} organizationId={scope.organizationId} documentId={saved.id} currentVersionId={saved.current_version_id}/>
   </div>}
   <div className="space-y-2"><div className="flex flex-wrap gap-2 items-center"><p className="text-sm font-medium">Сохранённые шаблоны организации</p><Button variant="outline" size="sm" disabled={busy} onClick={()=>void load(false)}>Обновить список</Button></div>
    <p className="text-xs text-muted-foreground">Здесь можно продолжить проверку после закрытия окна или перезагрузки страницы. Список не означает, что эти версии утверждены.</p>
    {items.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/30 p-2 text-sm"><span>{item.name}{item.status==='archived'?' · в архиве':item.status==='expired'?' · срок истёк':''}</span><Button variant="outline" size="sm" disabled={busy||!!operation.current&&!saved&&operation.current.documentId!==item.id} onClick={()=>choose(item)}>Открыть проверку</Button></div>)}
    {loaded&&!items.length&&<p className="text-xs text-muted-foreground">Доступных самостоятельных шаблонов на этой странице пока нет.</p>}
    {next&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void load(true)}>Ещё шаблоны</Button>}
   </div>
   <Button variant="outline" disabled={busy} onClick={()=>{if(!issuanceScopeCurrent(scope))return;props.onOpenChange(false);props.onReturnToTemplates();}}>Вернуться к выбору утверждённой версии</Button>
   <p className="text-xs text-muted-foreground">Для выдачи доступна только версия, которую подтвердит серверный список утверждённых HTML-шаблонов. Открытие проверки или закрытие этого окна не выбирает и не утверждает шаблон.</p>
  </div>}
  {busy&&<p role="status" className="text-sm text-muted-foreground">Проверяем текущие права и сохранённые версии…</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </DialogContent></Dialog>
 {saved&&versions&&current&&<OrgDocumentVersionsDialog transport={sourceTransport} sourceOpenMode="download" sourceDownloadSignal={sourceDownload.controller.signal} sourceDownloadAssertCurrent={sourceDownload.assertCurrent} open onOpenChange={value=>{setVersions(value);if(!value)void load(false);}} documentId={saved.id} documentName={saved.name} organizationId={scope.organizationId} canWrite={props.canWrite} onRestored={()=>void load(false)}/>}
 </>;
}
