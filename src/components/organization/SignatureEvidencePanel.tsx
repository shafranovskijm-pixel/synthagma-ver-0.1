import{SignaturePolicyManager}from'./SignaturePolicyManager';
import{SignatureAssuranceFiles}from'./SignatureAssuranceFiles';
import {useState} from 'react';
import {SignatureAssuranceActions}from'./SignatureAssuranceActions';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {useSignatureAssuranceWorkspace} from '@/hooks/useSignatureAssuranceWorkspace';
import {signatureEvidenceMessages,normalizeSignatureEvidenceError} from '@/lib/signatureAssurance/client';
import type {EvidenceDownloadFormat} from '@/lib/signatureAssurance/download';
import type {Conclusion,Event,EventKind,SigningParty,SupportedMethod} from '@/lib/signatureAssurance/types';

const parties:Record<SigningParty,string>={sender:'Отправитель',recipient:'Получатель'};
const methods:Record<SupportedMethod,string>={graphic_asset:'Графический макет',scan_received:'Получение скана',bearer_invitation_confirmation:'Подтверждение по ссылке',authenticated_account_confirmation:'Подтверждение из учётной записи'};
const conclusions:Record<Conclusion,string>={not_confirmed:'Новое подтверждение не зафиксировано',factual_confirmation:'Зафиксирован факт подтверждения',policy_eligible_account_confirmation:'Учётная запись подтвердила документ по выбранным правилам',scan_received:'Зафиксировано получение скана',graphic_prepared:'Подготовлен графический макет',legacy_unknown:'Исторические сведения без новой проверки'};
const events:Record<EventKind,string>={policy_created:'Создана версия правил',policy_source_checked:'Проверен источник правил',policy_reviewed:'Рассмотрены правила',policy_accepted:'Приняты правила',policy_retired:'Правила выведены из применения',signature_bound:'Выбраны правила и версия документа',graphic_prepared:'Подготовлен макет',bearer_confirmed:'Получено подтверждение по ссылке',account_confirmed:'Получатель подтвердил из учётной записи',scan_received:'Получен скан',sender_confirmed:'Отправитель подтвердил из учётной записи',agreement_accepted:'Подтверждён текст соглашения',consent_confirmed:'Подтверждён текст согласия',consent_withdrawn:'Согласие отозвано',invitation_revoked:'Приглашение отозвано',recipient_rejected:'Получатель отклонил документ'};
const legacy:Record<string,string>={draft:'Черновик',pending:'Ожидание действия',sent:'Документ отправлен',viewed:'Документ просмотрен',in_review:'Документ на проверке',changes_requested:'Запрошены изменения',signed:'Есть старая отметка подписания',rejected:'Документ отклонён',expired:'Срок приглашения истёк'};
const at=(value:string)=>new Date(value).toLocaleString('ru-RU');
function actorDescription(event:Event){return event.actor.observed_mode==='account'?'Действие учётной записи':event.actor.observed_mode==='bearer'?'Действие по приглашению':'Источник личности не подтверждён';}

/** Facts and current authorized actions share the existing document card design. */
export function SignatureEvidencePanel({organizationId,signatureId,open=true}:{organizationId:string;signatureId:string;open?:boolean}){
  const [party,setParty]=useState<SigningParty>('recipient');
  const model=useSignatureAssuranceWorkspace(organizationId,signatureId,party,open);
  const [notice,setNotice]=useState<{key:string;text:string}|null>(null);
  if(!open)return null;
  const context=model.context;
  const prepare=async(format:EvidenceDownloadFormat,retry=false)=>{
    const current=model.current,key=model.key;if(!current())return;setNotice(null);
    try{
      const ready=await(retry?model.retryDownload(format):model.prepareDownload(format));
      if(!current()){ready.dispose();return;}
      try{ready.handoff();if(current())setNotice({key,text:'Файл передан на скачивание.'});}
      catch{if(current())setNotice({key,text:'Не удалось начать автоматическое скачивание. Файл подготовлен; используйте кнопку ниже.'});}
    }catch(error){if(current())setNotice({key,text:signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]});}
  };
  const download=()=>{if(!model.current()||!model.download)return;try{model.download.handoff();setNotice({key:model.key,text:'Файл передан на скачивание.'});}catch(error){if(model.current())setNotice({key:model.key,text:signatureEvidenceMessages[normalizeSignatureEvidenceError(error).code]});}};
  return <div className="space-y-4">
    <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Подтверждения документа</CardTitle><Button variant="outline" size="sm" onClick={()=>void model.reload()} disabled={model.loading||model.saving}>Обновить</Button></div></CardHeader>
      <CardContent className="space-y-3"><div className="flex gap-2" aria-label="Сторона документа">{(['recipient','sender']as const).map(role=><Button key={role} variant={party===role?'default':'outline'} size="sm" aria-pressed={party===role} onClick={()=>setParty(role)}>{parties[role]}</Button>)}</div>
        {model.loading&&<p className="text-sm text-muted-foreground" role="status">Загружаем подтверждения…</p>}
        {model.error&&<p className="text-sm text-destructive" role="alert">{signatureEvidenceMessages[model.error]}</p>}
        {context&&<><div className="grid gap-3 md:grid-cols-2">{(['sender','recipient']as const).map(role=>{
          const value=context.parties[role];return <div key={role} className="rounded-md border p-3 space-y-2"><p className="font-medium text-sm">{parties[role]}</p><Badge variant="secondary" className="whitespace-normal">{conclusions[value.conclusion]}</Badge><p className="text-sm text-muted-foreground">{value.policy?methods[value.policy.body.method]:'Способ для этой стороны ещё не выбран'}</p></div>;
        })}</div>
        <div className="rounded-md bg-muted/40 p-3 space-y-2"><p className="font-medium text-sm">Условия для стороны «{parties[party]}»</p><p className="text-sm">{context.parties[party].requirements.eligible?'Технические условия выбранного способа выполнены.':'Пока не выполнены все условия выбранного способа.'}</p>{context.parties[party].requirements.missing.map(code=><p key={code} className="text-sm text-muted-foreground">{signatureEvidenceMessages[code]}</p>)}{context.parties[party].requirements.limitations.map((text,index)=><p key={index} className="text-xs text-muted-foreground">{text}</p>)}</div>
        {context.parties[party].policy&&<div className="space-y-1 text-sm"><p className="font-medium">Правила: версия {context.parties[party].policy!.version}</p><p>{context.parties[party].policy!.body.basis.explanation}</p><p className="text-muted-foreground">{context.parties[party].policy!.body.limitations}</p></div>}
        {context.legacy_evidence_available&&<p className="text-xs text-muted-foreground">Ранее сохранённые сведения: {legacy[context.legacy_status]??'исторический статус не расшифрован'}. Они не заменяют подтверждения сторон, показанные выше.</p>}
        <p className="text-xs text-muted-foreground">Подтверждение через код из письма и проверка УКЭП пока не поддерживаются.</p></>}
      </CardContent></Card>
    {context&&<SignaturePolicyManager organizationId={organizationId}model={{key:model.key,current:model.current,capabilities:context.capabilities}}/>}
    {context&&<SignatureAssuranceFiles organizationId={organizationId}signatureId={signatureId}party={party}model={model}/>}
    {context&&<SignatureAssuranceActions organizationId={organizationId}signatureId={signatureId}party={party}model={model}/>}
    {context&&<Card><CardHeader className="pb-3"><CardTitle className="text-base">История стороны «{parties[party]}»</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-xs text-muted-foreground">В общей истории загружено {model.events.length} из {model.historyThrough} событий. Ниже показаны события выбранной стороны.</p>
      {model.events.filter(event=>event.party_role===party).map(event=><div key={event.id} className="border-b pb-3 space-y-1 last:border-b-0"><p className="text-sm font-medium">{events[event.kind]}</p><p className="text-xs text-muted-foreground">{at(event.server_at)} · {actorDescription(event)}</p>{event.actor.declared_full_name&&<p className="text-sm">Имя, указанное участником: {event.actor.declared_full_name}</p>}<p className="text-sm">{event.explanation}</p></div>)}
      {!model.events.some(event=>event.party_role===party)&&<p className="text-sm text-muted-foreground">Среди загруженных событий пока нет действий этой стороны.</p>}
      {!model.historyComplete&&<Button variant="outline" size="sm" disabled={model.saving} onClick={()=>void model.loadMore()}>Показать ещё</Button>}
    </CardContent></Card>}
    {context&&<Card><CardHeader className="pb-3"><CardTitle className="text-base">Пакет подтверждений</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Сохраняется отдельный снимок полной истории обеих сторон и доступных вам доказательств. Скрытые сведения остаются закрытыми.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={model.saving||model.pending||!context.capabilities.can_capture_receipt} onClick={()=>void prepare('json')}>Подготовить JSON</Button><Button variant="outline" size="sm" disabled={model.saving||model.pending||!context.capabilities.can_capture_receipt} onClick={()=>void prepare('html')}>Подготовить HTML</Button></div>
      {model.pending&&!model.saving&&<div className="space-y-2"><p className="text-sm text-muted-foreground">Результат подготовки пока не подтверждён. Повторите тот же запрос.</p><Button size="sm" variant="outline" onClick={()=>void prepare('json',true)}>Проверить сохранённый запрос</Button></div>}
      {model.actionError&&<p className="text-sm text-destructive" role="alert">{signatureEvidenceMessages[model.actionError]}</p>}
      {model.download&&<div className="rounded-md border p-3 space-y-2"><p className="text-sm">Выгрузка готова: {model.download.format.toUpperCase()}. Если загрузка не началась автоматически, нажмите «Скачать».</p><Button size="sm" onClick={download}>Скачать</Button><p className="text-xs text-muted-foreground">Ссылка доступна 5 минут и закрывается при смене кабинета, стороны документа или прав доступа.</p></div>}
      {notice?.key===model.key&&<p className="text-sm text-muted-foreground" role="status">{notice.text}</p>}
    </CardContent></Card>}
  </div>;
}
