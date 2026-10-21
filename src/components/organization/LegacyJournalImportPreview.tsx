import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CustomJournalsModel } from '@/hooks/useCustomJournals';
import { parseLegacyDefinitions, type LegacyDefinitionPreview } from '@/lib/customJournals/legacy';
import { customJournalMessages, normalizeCustomJournalError } from '@/lib/customJournals/client';
import type { JournalRead, LegacyJournalRecord } from '@/lib/customJournals/contract';

type ServerPreview=Extract<JournalRead,{kind?:'preview_legacy'}>['preview'];
export function LegacyJournalImportPreview({organizationId,model,open,onClose,onImported}:{organizationId:string;model:CustomJournalsModel;open:boolean;onClose:()=>void;onImported:(id:string)=>void}){
 const identity=model.contextKey+'|open:'+open;const generation=useRef({identity,number:0});if(generation.current.identity!==identity)generation.current={identity,number:generation.current.number+1};
 const key=identity+'|generation:'+generation.current.number;const current=useRef(key);current.current=key;const mounted=useRef(true);const isCurrent=()=>mounted.current&&current.current===key;
 const [local,setLocal]=useState<{key:string;items:LegacyDefinitionPreview[]}|null>(null);const [previews,setPreviews]=useState<{key:string;items:Record<number,ServerPreview>}>({key,items:{}});
 const [inventory,setInventory]=useState<{key:string;rows:Extract<JournalRead,{kind?:'legacy_inventory'}>['legacy_journals'];next:string|null}|null>(null);
 const [oldRecords,setOldRecords]=useState<{key:string;legacyId:string;rows:LegacyJournalRecord[];next:string|null}|null>(null);
 const [error,setError]=useState<{key:string;text:string}|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setLocal(null);setInventory(null);setOldRecords(null);setPreviews({key,items:{}});setError(null);setBusy(false);if(!open||!model.canRead)return;
  let live=true;void model.read({kind:'legacy_inventory',after_legacy_id:null,limit:50}).then(r=>{if(live&&isCurrent()&&r.kind==='legacy_inventory')setInventory({key,rows:r.legacy_journals,next:r.next_after_legacy_id});}).catch(e=>{if(live&&isCurrent())setError({key,text:customJournalMessages[normalizeCustomJournalError(e).code]});});
  try{setLocal({key,items:parseLegacyDefinitions(localStorage.getItem('custom_journals_'+organizationId))});}catch{setError({key,text:'Не удалось прочитать локальное хранилище. Исходные данные не изменены.'});}
  return()=>{live=false;};
 },[open,key,organizationId,model.canRead,model.read]);
 const items=local?.key===key?local.items:[];const fail=(e:unknown)=>{if(isCurrent())setError({key,text:customJournalMessages[normalizeCustomJournalError(e).code]});};
 const preview=async(item:LegacyDefinitionPreview)=>{if(!item.definition||!model.canRead)return;setBusy(true);try{const r=await model.read({kind:'preview_legacy',definition:item.definition});if(isCurrent()&&r.kind==='preview_legacy')setPreviews(old=>({key,items:{...(old.key===key?old.items:{}),[item.index]:r.preview}}));}catch(e){fail(e);}finally{if(isCurrent())setBusy(false);}};
 const finish=async(item:LegacyDefinitionPreview)=>{if(!item.definition||!model.canWrite)return;try{const r=await model.mutate(0,{action:'import_definition',definition:item.definition});if(isCurrent()){onImported(r.journal.id);onClose();}}catch(e){fail(e);}};
 const retry=async()=>{try{const r=await model.retry();if(isCurrent()){onImported(r.journal.id);onClose();}}catch(e){fail(e);}};
 const loadInventory=async()=>{if(!inventory?.next)return;try{const r=await model.read({kind:'legacy_inventory',after_legacy_id:inventory.next,limit:50});if(isCurrent()&&r.kind==='legacy_inventory')setInventory(old=>({key,rows:[...(old?.key===key?old.rows:[]),...r.legacy_journals],next:r.next_after_legacy_id}));}catch(e){fail(e);}};
 const readOld=async(legacyId:string,after:string|null=null)=>{setBusy(true);try{const r=await model.read({kind:'legacy_records',legacy_id:legacyId,after_id:after,limit:25});if(isCurrent()&&r.kind==='legacy_records')setOldRecords(old=>({key,legacyId,rows:after&&old?.key===key&&old.legacyId===legacyId?[...old.rows,...r.records]:r.records,next:r.next_after_id}));}catch(e){fail(e);}finally{if(isCurrent())setBusy(false);}};
 return <Dialog open={open} onOpenChange={value=>{if(!value&&!model.saving)onClose();}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Перенос определений из этого браузера</DialogTitle></DialogHeader>
  <p className="text-sm text-muted-foreground">Перенос сохраняет выбранные поля на сервере. Локальные определения и прежние серверные отметки не удаляются и не преобразуются в новые поля автоматически.</p>
  {error?.key===key&&<p role="alert" className="text-sm text-destructive">{error.text}</p>}
  {!model.canRead&&<p className="text-sm text-muted-foreground">Сначала подтвердите доступ к журналам.</p>}
  {local?.key===key&&items.length===0&&<p className="text-sm text-muted-foreground">Локальных определений в этом браузере не найдено.</p>}
  {items.map(item=>{const check=previews.key===key?previews.items[item.index]:undefined;return <div key={item.index} className="border border-border rounded-xl p-4 space-y-2">
   <h3 className="font-medium">{item.definition?.title||'Определение №'+(item.index+1)}</h3>{item.problem?<p className="text-sm text-destructive">{item.problem}</p>:<><p className="text-xs text-muted-foreground">{item.definition!.id} · полей: {item.definition!.fields.length}</p><Button variant="outline" className="rounded-xl" onClick={()=>preview(item)} disabled={busy||model.saving}>Проверить перенос</Button>
   {check&&<><p className="text-sm">{check.reason||({ready:'Можно перенести определение.',already_imported:'Это определение уже перенесено.',conflict:'Конфликт с перенесённым определением. Данные сохранены.',invalid:'Определение требует проверки.'}[check.state])}</p><p className="text-xs text-muted-foreground">Прежних серверных журналов: {check.server_legacy_instance_count}; записей: {check.server_legacy_entry_count}.</p>
    {check.state==='ready'&&<Button className="rounded-xl" onClick={()=>finish(item)} disabled={!model.canWrite||model.pending||model.saving||busy}>Перенести определение</Button>}
    {check.state==='already_imported'&&check.journal_id&&<Button variant="outline" className="rounded-xl" onClick={()=>{onImported(check.journal_id!);onClose();}}>Открыть перенесённый журнал</Button>}
   </>}</>}
  </div>;})}
  {inventory?.key===key&&inventory.rows.length>0&&<div className="space-y-3"><h3 className="font-semibold">Прежние серверные журналы</h3><p className="text-xs text-muted-foreground">Доступны и при утрате определения в браузере. Структура выбранных полей не восстанавливается по отметкам.</p>{inventory.rows.map(j=><div key={j.legacy_id} className="border border-border rounded-xl p-3 space-y-2"><p className="text-sm">{j.legacy_id} · журналов: {j.instance_count}; записей: {j.entry_count}</p><Button variant="outline" className="rounded-xl" onClick={()=>readOld(j.legacy_id)} disabled={busy}>Читать прежние записи</Button></div>)}{inventory.next&&<Button variant="outline" className="rounded-xl" onClick={loadInventory} disabled={busy}>Ещё прежние журналы</Button>}</div>}
  {oldRecords?.key===key&&<div className="border border-border rounded-xl p-3 space-y-2"><h3 className="font-medium">{oldRecords.legacyId}: только чтение</h3>{oldRecords.rows.map(r=><div key={r.id} className="text-sm border-b border-border py-2"><p>{r.journal_title} · {r.entry_date} · {r.user_id}</p><p>{r.entry_type}: {r.value??'—'}{r.notes?' · '+r.notes:''}</p><p className="text-xs text-muted-foreground">{r.id}</p></div>)}{oldRecords.rows.length===0&&<p className="text-sm text-muted-foreground">Отметок не найдено.</p>}{oldRecords.next&&<Button variant="outline" className="rounded-xl" onClick={()=>readOld(oldRecords.legacyId,oldRecords.next)} disabled={busy}>Ещё прежние записи</Button>}</div>}
  {model.pending&&<Button variant="outline" className="rounded-xl" onClick={retry} disabled={model.saving}>Повторить тот же запрос</Button>}
 </DialogContent></Dialog>;
}
