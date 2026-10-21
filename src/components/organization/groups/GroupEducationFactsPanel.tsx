import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGroupEducationFacts } from '@/hooks/useGroupEducationFacts';
import { educationMessages } from '@/lib/groupEducationFacts/client';
import type { EducationAction,LessonInput } from '@/lib/groupEducationFacts/contract';
import { ConductedSessionsPanel } from './ConductedSessionsPanel';

export interface GroupEducationFactsPanelProps {organizationId:string;groupId:string;mode?:'manage'|'readonly';enabled?:boolean;observedAccessKey?:string}
const coverageNames={complete_observed:'Подтверждённое наблюдение',unknown_legacy:'Ранний состав неизвестен',unknown_gap:'Пробел в наблюдении',source_unavailable:'Источник недоступен'};
const actionNames:Record<string,string>={initialized:'Начато наблюдение',membership_observed:'Изменение состава',membership_time_corrected:'Уточнение времени',calendar_saved:'Версия календаря',calendar_published:'Календарь опубликован',roster_captured:'Снимок состава',legacy_calendar_changed:'Изменились прежние настройки',association_observed:'Связь с зачислением',coverage_gap:'Пробел наблюдения',coverage_recovered:'Новый период наблюдения'};
export function GroupEducationFactsPanel({organizationId,groupId,mode='manage',enabled=true,observedAccessKey=''}:GroupEducationFactsPanelProps){
 const facts=useGroupEducationFacts(organizationId,groupId,enabled,mode,observedAccessKey);
 return <GroupEducationFactsView key={facts.scopeKey} organizationId={organizationId} groupId={groupId} mode={mode} enabled={enabled} facts={facts}/>;
}
function GroupEducationFactsView({organizationId,groupId,mode,enabled,facts:f}:GroupEducationFactsPanelProps&{facts:ReturnType<typeof useGroupEducationFacts>}){
 const e=f.envelope,s=e?.state;
 const [timezone,setTimezone]=useState(''),[reason,setReason]=useState(''),[at,setAt]=useState(''),[dateStart,setDateStart]=useState(''),[dateEnd,setDateEnd]=useState('');
 const [lessons,setLessons]=useState<LessonInput[]>([]),[plan,setPlan]=useState<'whole_program'|'partial_plan'>('whole_program'),[partial,setPartial]=useState('');
 const [correction,setCorrection]=useState<{event_id:string;expected_event_hash:string}|null>(null),[correctedAt,setCorrectedAt]=useState('');
 const writable=mode==='manage'&&!!e&&[e.capabilities.can_initialize,e.capabilities.can_correct_membership_time,e.capabilities.can_edit_calendar,e.capabilities.can_publish_calendar,e.capabilities.can_capture_snapshot,e.capabilities.can_recover_coverage].some(Boolean);const blocked=f.busy||f.pending||f.loading;const cal=f.calendarValue?.calendar;
 useEffect(()=>{if(s){setTimezone(s.timezone);void f.roster();void f.calendar();void f.history();if(writable)void f.options('teachers');}},[organizationId,groupId,s?.revision,mode]);
 useEffect(()=>{if(cal&&writable){setTimezone(cal.timezone);setDateStart(cal.planned_start_date);setDateEnd(cal.planned_end_date);setPlan(cal.coverage);setPartial(cal.partial_reason??'');setLessons(cal.lessons.map(({lesson_id,local_date,starts_at,ends_at,topic,module_label,course_lesson_id,academic_hours,teacher_user_id,status,cancellation_reason})=>({lesson_id,local_date,starts_at,ends_at,topic,module_label,course_lesson_id,academic_hours,teacher_user_id,status,cancellation_reason})));}},[cal?.id,writable]);
 const run=(action:EducationAction)=>void f.mutate(action);
 const update=(index:number,values:Partial<LessonInput>)=>setLessons(all=>all.map((l,i)=>i===index?{...l,...values}:l));
 if(!enabled)return null;
 return <section className="space-y-4 rounded-lg border p-4" aria-label="Состав и календарь группы">
  <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Состав и календарь группы</h3><Button type="button" variant="outline" size="sm" disabled={blocked} onClick={()=>void f.refresh()}>Обновить</Button></div>
  <p className="text-xs text-muted-foreground">История начинается с наблюдения системой. Состав на дату, дата документа и время наблюдения отображаемого имени — отдельные сведения. Эти сведения не подтверждают посещение, аттестацию или юридическое имя.</p>
  {f.loading&&<p role="status">Загрузка сведений…</p>}
  {f.error&&<p role="alert" className="text-sm text-destructive">{educationMessages[f.error]}</p>}
  {f.pending&&writable&&<Button type="button" disabled={f.busy} onClick={()=>void f.retry()}>Повторить тот же запрос</Button>}
  {e?.prerequisites.map((p,i)=><p key={p.code+String(i)} className="text-sm">{p.label}</p>)}
  {s&&<p className="text-sm">{coverageNames[s.coverage]}. Наблюдение с {s.coverage_known_from}; версия {s.revision}.</p>}
  {s?.active_gap&&<p className="text-sm">С {s.active_gap.started_at} состав не подтверждён. Восстановление начнёт новый период; прежний пробел останется неизвестным.</p>}
  {writable&&e&&<div className="space-y-2"><Label>Часовой пояс IANA</Label><Input aria-label="Часовой пояс IANA" value={timezone} onChange={v=>setTimezone(v.target.value)} placeholder="Например, Europe/Moscow"/><Label>Основание действия</Label><Textarea aria-label="Основание действия" value={reason} onChange={v=>setReason(v.target.value)} placeholder="Укажите причину изменения или проверки"/>
   {!s&&e.capabilities.can_initialize&&e.program_ref&&<Button type="button" disabled={blocked||!timezone||!reason} onClick={()=>run({action:'initialize_history',timezone,expected_program_ref:e.program_ref!,reason})}>Начать наблюдение текущего состава</Button>}
   {s?.active_gap&&s.capabilities.can_recover_coverage&&<><Button type="button" disabled={blocked||!reason||!e.program_ref} onClick={()=>{if(e.program_ref)run({action:'recover_coverage',gap_id:s.active_gap!.id,expected_program_ref:e.program_ref,reason});}}>Наблюдать текущий состав заново</Button>{!e.program_ref&&<p className="text-sm">Восстановление недоступно: сначала подтвердите текущую программу и её исходный документ.</p>}</>}
  </div>}
  {s&&<>
   <div className="space-y-2"><h4 className="font-medium text-sm">Состав</h4><div className="flex flex-wrap gap-2"><Input aria-label="Момент состава с часовым смещением" placeholder="2026-10-19T12:00:00+03:00" value={at} onChange={v=>setAt(v.target.value)}/><Button type="button" variant="outline" onClick={()=>void f.roster(at?{kind:'at',at,timezone}: {kind:'current'})}>Показать состав</Button></div>
   </div>
   <RosterView facts={f}/>
   <div className="space-y-2"><div className="flex flex-wrap gap-2"><h4 className="font-medium text-sm">Календарь</h4><Button type="button" size="sm" variant="outline" onClick={()=>void f.calendar({kind:'current',view:'published'})}>Опубликованный</Button>{writable&&<Button type="button" size="sm" variant="outline" onClick={()=>void f.calendar({kind:'current',view:'draft'})}>Черновик</Button>}</div>
    {cal&&<><p className="text-sm">{cal.state==='draft'?'Черновик':'Сохранённая версия'}: {cal.planned_start_date} — {cal.planned_end_date}; {cal.timezone}. Часы: {cal.academic_hours_total??'не заполнены'}; известно {cal.known_academic_hours_total}, не заполнено {cal.missing_hours_count}.</p>{!writable&&cal.lessons.map(l=><p className="text-sm" key={l.lesson_id}>{l.local_date} — {l.topic}; {l.academic_hours??'часы неизвестны'}; {l.teacher_label??'преподаватель не подтверждён'}{l.status==='cancelled'?' (отменено)':''}</p>)}</>}
    {writable&&s.capabilities.can_edit_calendar&&<div className="space-y-3">
     <div className="grid grid-cols-2 gap-2"><Input type="date" aria-label="Начало плана" value={dateStart} onChange={v=>setDateStart(v.target.value)}/><Input type="date" aria-label="Окончание плана" value={dateEnd} onChange={v=>setDateEnd(v.target.value)}/></div>
     <select className="w-full rounded-md border bg-background p-2 text-sm" aria-label="Охват плана" value={plan} onChange={v=>setPlan(v.target.value as typeof plan)}><option value="whole_program">Вся программа</option><option value="partial_plan">Часть программы</option></select>
     {plan==='partial_plan'&&<Input aria-label="Причина частичного плана" value={partial} onChange={v=>setPartial(v.target.value)}/>}
     {lessons.map((l,i)=><div className="space-y-2 rounded border p-2" key={l.lesson_id??'new-'+i}>
      <div className="grid grid-cols-2 gap-2"><Input type="date" aria-label={`Дата занятия ${i+1}`} value={l.local_date} onChange={v=>update(i,{local_date:v.target.value})}/><Input aria-label={`Тема занятия ${i+1}`} value={l.topic} onChange={v=>update(i,{topic:v.target.value})}/><Input aria-label={`Начало занятия ${i+1} со смещением`} placeholder="Неизвестно" value={l.starts_at??''} onChange={v=>update(i,{starts_at:v.target.value||null})}/><Input aria-label={`Окончание занятия ${i+1} со смещением`} placeholder="Неизвестно" value={l.ends_at??''} onChange={v=>update(i,{ends_at:v.target.value||null})}/><Input aria-label={`Академические часы ${i+1}`} value={l.academic_hours??''} onChange={v=>update(i,{academic_hours:v.target.value||null})}/>
      <select aria-label={`Преподаватель занятия ${i+1}`} className="rounded border bg-background p-2 text-sm" value={l.teacher_user_id??''} onChange={v=>update(i,{teacher_user_id:v.target.value||null})}><option value="">Не выбран</option>{f.teachers?.items.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></div>
      <select aria-label={`Статус занятия ${i+1}`} value={l.status} onChange={v=>update(i,{status:v.target.value as 'planned'|'cancelled'})}><option value="planned">Планируется</option><option value="cancelled">Отменено</option></select>{l.status==='cancelled'&&<Input aria-label={`Причина отмены ${i+1}`} value={l.cancellation_reason??''} onChange={v=>update(i,{cancellation_reason:v.target.value||null})}/>}<Button type="button" variant="ghost" size="sm" onClick={()=>setLessons(v=>v.filter((_,n)=>n!==i))}>Убрать из нового черновика</Button>
     </div>)}
     {f.teachers?.next_after_id&&<Button type="button" variant="outline" onClick={()=>void f.options('teachers',true)}>Ещё преподаватели</Button>}
     <Button type="button" variant="outline" disabled={lessons.length>=250} onClick={()=>setLessons(v=>[...v,{lesson_id:null,local_date:'',starts_at:null,ends_at:null,topic:'',module_label:null,course_lesson_id:null,academic_hours:null,teacher_user_id:null,status:'planned',cancellation_reason:null}])}>Добавить занятие</Button>
     <Button type="button" disabled={blocked||!reason||!dateStart||!dateEnd} onClick={()=>run({action:'save_calendar_version',base_version_id:cal?.id??null,expected_program_ref:s.program_ref,timezone,planned_start_date:dateStart,planned_end_date:dateEnd,coverage:plan,partial_reason:plan==='partial_plan'?partial:null,lessons,reason})}>Сохранить новую версию</Button>
    </div>}
    {writable&&cal?.state==='draft'&&s.capabilities.can_publish_calendar&&<Button type="button" disabled={blocked||!reason} onClick={()=>run({action:'publish_calendar_version',version_id:cal.id,expected_content_hash:cal.content_hash,expected_program_ref:s.program_ref,reason})}>Опубликовать план</Button>}
    {writable&&s.capabilities.can_capture_snapshot&&cal&&cal.state!=='draft'&&<Button type="button" disabled={blocked||!reason} onClick={async()=>{const result=await f.mutate({action:'capture_roster_snapshot',as_of:at?{kind:'at',at,timezone}:{kind:'current'},knowledge_revision:s.revision,calendar_version_id:cal.id,expected_calendar_hash:cal.content_hash,expected_program_ref:s.program_ref,purpose:'document_batch',reason});if(result&&f.scopeCurrent()&&result.receipt.snapshot_id)await f.snapshot(result.receipt.snapshot_id);}}>Зафиксировать состав для документов</Button>}
    {f.snapshotValue&&<p className="text-sm">Снимок состава подтверждён: {f.snapshotValue.header.row_count} участников. Дата состава {f.snapshotValue.header.as_of}.</p>}
   </div>
   <ConductedSessionsPanel key={f.scopeKey} organizationId={organizationId} groupId={groupId} facts={f} readonly={mode==='readonly'}/>
   <div className="space-y-2"><h4 className="font-medium text-sm">История</h4>{f.historyValue?.events.map(event=><div key={event.id} className="text-sm"><p>{actionNames[event.action]??event.action} — {event.recorded_at}; версия {event.revision}{event.reason?'. '+event.reason:''}</p>{writable&&event.action==='membership_observed'&&s.capabilities.can_correct_membership_time&&<Button type="button" variant="ghost" size="sm" onClick={()=>setCorrection({event_id:event.id,expected_event_hash:event.input_hash})}>Уточнить время</Button>}</div>)}{f.historyValue?.next_after_revision!==null&&f.historyValue&&<Button type="button" variant="outline" onClick={()=>void f.history(true)}>Ещё события</Button>}
    {writable&&correction&&<div className="space-y-2"><Input aria-label="Уточнённый момент со смещением" value={correctedAt} onChange={v=>setCorrectedAt(v.target.value)}/><Button type="button" disabled={blocked||!reason||!correctedAt} onClick={()=>run({action:'correct_membership_time',...correction,corrected_effective_at:correctedAt,reason})}>Сохранить обоснованное уточнение</Button></div>}
   </div>
  </>}
 </section>;
}
function RosterView({facts:f}:{facts:ReturnType<typeof useGroupEducationFacts>}){const r=f.rosterValue;return r?<div className="space-y-2 text-sm"><p>{coverageNames[r.coverage]}; на {r.as_of}. {r.count.exact_count===null?`Подтверждённое число неизвестно${r.count.count_lower_bound?' (не менее '+r.count.count_lower_bound+')':''}`:`Участников: ${r.count.exact_count}`}</p>{r.prerequisites.map((p,i)=><p key={i}>{p.label}</p>)}{r.rows.map(row=><div key={row.user_id}>{row.subject_label??(row.label_state==='redacted'?'Сведения удалены':'Отображаемое имя недоступно')}{row.label_observed_at&&<p className="text-xs text-muted-foreground">Отображаемая подпись наблюдалась {row.label_observed_at}</p>}</div>)}{r.next_after_user_id&&<Button type="button" variant="outline" onClick={()=>void f.roster({kind:'current'},true)}>Ещё участники</Button>}</div>:null;}
