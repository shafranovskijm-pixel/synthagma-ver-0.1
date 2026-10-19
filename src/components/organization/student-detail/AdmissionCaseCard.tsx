import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, RefreshCw, History, ShieldCheck } from 'lucide-react';
import { useAdmissionCase, type AdmissionCaseController } from '@/hooks/useAdmissionCase';
import { admissionErrorMessages } from '@/lib/admissionCases/client';
import * as c from '@/lib/admissionCases/contract';
import { AdmissionEvidenceSection, AdmissionEvidenceHistory } from './AdmissionEvidenceSection';
import { groupFolderPath } from '@/lib/groups/groupContext';

const fieldClass = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
const stamp = (value:string) => new Date(value).toLocaleString('ru-RU');
const eventLabels:Record<string,string> = {initialize:'Личное дело открыто',assign_responsible:'Ответственный назначен',review_local_rules:'Правила проверены',review_requirement:'Применимость рассмотрена',review_evidence:'Версия проверена',record_decision:'Решение ответственного',evidence_committed:'Версия файла сохранена'};

interface Props {organizationId:string;studentUserId:string;enabled?:boolean;observedAccessKey?:string;visible?:boolean;courseLabels?:Record<string,string>;ownOnly?:boolean;onUploadOwn?:()=>void}
export function AdmissionCaseCard({organizationId,studentUserId,enabled=true,observedAccessKey='',visible=true,courseLabels={},ownOnly=false,onUploadOwn}:Props) {
  const controller = useAdmissionCase(organizationId,studentUserId,enabled,observedAccessKey,ownOnly);
  if (!visible || !enabled) return null;
  return <Card className="rounded-2xl border-border/60 shadow-sm mb-5">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-primary"/>Личное дело и допуск</CardTitle>
      <p className="text-xs text-muted-foreground">Решение ответственного по точной группе и программе учитывается отдельно от загрузки файлов и доступа к обучению.</p></CardHeader>
    <CardContent className="space-y-4">
      {controller.associationsLoading && <p className="text-sm text-muted-foreground" role="status">Проверяем зачисления…</p>}
      {controller.associationsError && <ErrorBox code={controller.associationsError} onRetry={() => void controller.refreshAssociations()}/>}
      {controller.associations && <>
        <label className="block space-y-1 text-sm"><span>Группа и зачисление</span><select aria-label="Группа и зачисление" className={fieldClass} value={controller.selected?.group_id || ''}
          onChange={event => controller.selectAssociation(controller.associations!.items.find(item => item.scope.group_id === event.target.value)?.scope || null)}>
          <option value="">Выберите точную группу</option>{controller.associations.items.map(item => <option key={item.scope.group_id} value={item.scope.group_id}>{courseLabels[item.scope.course_id] || 'Учебная программа'} · {item.group_label}</option>)}</select></label>
        {controller.associations.has_more && <Button size="sm" variant="outline" onClick={() => void controller.refreshAssociations(true)}>Ещё зачисления</Button>}
        {!controller.associations.items.length && <p className="text-sm text-muted-foreground">Нет подтверждённой связи с группой. Обратитесь к ответственному за зачисления.</p>}
        {controller.associations.prerequisites.map(item => <p key={item.code} className="text-sm text-muted-foreground">{item.public_label}</p>)}
      </>}
      {controller.loading && <p role="status" className="text-sm text-muted-foreground">Загружаем выбранное личное дело…</p>}
      {controller.error && <ErrorBox code={controller.error} onRetry={() => void controller.refresh()}/>}
      {controller.data && <CasePanel key={controller.viewKey} controller={controller} onUploadOwn={onUploadOwn}/>}
    </CardContent>
  </Card>;
}
function ErrorBox({code,onRetry}:{code:c.AdmissionErrorCode;onRetry?:()=>void}) {
  return <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><p>{admissionErrorMessages[code]}</p>
    {onRetry && <Button size="sm" variant="outline" className="gap-2" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5"/>Повторить проверку</Button>}</div>;
}
function CasePanel({controller:h,onUploadOwn}:{controller:AdmissionCaseController;onUploadOwn?:()=>void}) {
  const data = h.data!;
  if (data.projection === 'learner') return <>
    {data.prerequisites.map(item => <p className="text-sm text-muted-foreground" key={item.code}>{item.public_label}</p>)}
    {data.state ? <div className="space-y-3"><p className="font-medium text-sm">{data.state.program_title}</p><Badge variant="secondary">{c.admissionOutcomeLabels[data.state.outcome]}</Badge>
      {data.state.outcome_recorded_at && <p className="text-xs text-muted-foreground">Записано {stamp(data.state.outcome_recorded_at)}</p>}
      {data.state.later_review_required && <p className="text-sm text-muted-foreground">Новые сведения ожидают дополнительной проверки. Предыдущее решение сохранено в истории.</p>}
      {data.state.tasks.filter(task => task.status === 'open').map(task => <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span>{task.public_label}</span>
        {task.next_action === 'upload_own_attachment' && onUploadOwn && <Button size="sm" variant="outline" onClick={onUploadOwn}>Загрузить сведения</Button>}
        {task.next_action === 'contact_staff' && <span className="text-xs text-muted-foreground">Обратитесь к ответственному</span>}</div>)}</div>
      : <p className="text-sm text-muted-foreground">Ответственный ещё не открыл личное дело по этому зачислению.</p>}
  </>;
  const state = data.state;
  return <div className="space-y-4">
    {data.program_title && <p className="font-medium text-sm">{data.program_title}</p>}
    {data.prerequisites.map(item => <p key={item.code} className="text-sm text-muted-foreground">{item.public_label}</p>)}
    {data.prerequisites.some(item => item.next_action === 'open_programme_confirmation') && <Button size="sm" variant="outline" asChild><a href={groupFolderPath(data.scope.group_id)}>Открыть папку группы для проверки программы</a></Button>}
    {!state && <><p className="text-sm text-muted-foreground">Открытие личного дела закрепит подтверждённую версию программы. Оно не создаёт зачисление или решение о допуске.</p>
      <Button size="sm" disabled={!data.capabilities.can_initialize || !data.program_ref || h.busy || h.pending} onClick={() => data.program_ref && void h.mutate({action:'initialize',group_id:data.scope.group_id,enrollment_id:data.scope.enrollment_id,expected_revision:0,expected_program_ref:data.program_ref})}>Открыть личное дело</Button></>}
    {h.operationError && <ErrorBox code={h.operationError}/>}
    {h.pending && <div className="rounded-xl border p-3 text-sm space-y-2"><p>Результат сохранения пока не подтверждён. Повтор будет отправлен с тем же номером запроса.</p><Button size="sm" variant="outline" disabled={h.busy} onClick={() => void h.retryPending()}>Повторить сохранение</Button></div>}
    {state && <StaffCasePanel key={state.id} controller={h} state={state}/>}
  </div>;
}
function StaffCasePanel({controller:h,state}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase}) {
  const [responsibles,setResponsibles] = useState<Extract<c.AdmissionOptions,{kind?:'responsibles'}>|null>(null);
  const [responsibleId,setResponsibleId] = useState(''); const [assignmentReason,setAssignmentReason] = useState('');
  const [history,setHistory] = useState<c.AdmissionHistory|null>(null);
  const disabled = h.busy || h.pending;
  const common = {case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref};
  const loadResponsibles = async (more=false) => {const result = await h.options('responsibles',more ? responsibles?.next_after_id || null : null);if (result?.kind === 'responsibles') setResponsibles({...result,items:more && responsibles ? [...responsibles.items,...result.items] : result.items});};
  const loadHistory = async (more=false) => {const result = await h.history(more ? history?.next_before_revision || null : null,more ? history?.ceiling_revision || null : null);if(result) setHistory({...result,items:more && history ? [...history.items,...result.items] : result.items});};
  return <>
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Версия личного дела {state.revision}</Badge>
      <Badge variant="secondary">{state.decision ? c.admissionOutcomeLabels[state.decision.outcome] : 'Решение ещё не принято'}</Badge></div>
    {state.decision && <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1"><p>{state.decision.reason}</p><p className="text-xs text-muted-foreground">{stamp(state.decision.recorded_at)}</p>
      {state.decision.later_review_required && <p>Новые сведения требуют проверки; предыдущее решение сохранено.</p>}</div>}
    <div className="rounded-xl border p-3 space-y-3"><p className="text-sm font-medium">Ответственный</p>
      <p className="text-xs text-muted-foreground">{responsibles?.items.find(item => item.user_id === state.responsible_id)?.display_name || (state.responsible_id ? 'Ответственный назначен' : 'Не назначен')}</p>
      {state.capabilities.can_assign && <><Button size="sm" variant="outline" disabled={disabled} onClick={() => void loadResponsibles()}>Выбрать ответственного</Button>
        {responsibles && <div className="space-y-2"><select aria-label="Ответственный" className={fieldClass} value={responsibleId} onChange={event => setResponsibleId(event.target.value)} disabled={disabled}><option value="">Выберите сотрудника</option>{responsibles.items.map(item => <option value={item.user_id} key={item.user_id}>{item.display_name}</option>)}</select>
          {responsibles.has_more && <Button size="sm" variant="outline" onClick={() => void loadResponsibles(true)}>Ещё сотрудники</Button>}
          <Textarea aria-label="Основание назначения" placeholder="Основание назначения" value={assignmentReason} maxLength={4000} onChange={event => setAssignmentReason(event.target.value)} disabled={disabled}/>
          <Button size="sm" disabled={disabled || !responsibleId || !assignmentReason.trim()} onClick={() => void h.mutate({...common,action:'assign_responsible',responsible_id:responsibleId,reason:assignmentReason.trim()})}>Назначить</Button></div>}</>}
    </div>
    {h.resourceError && <ErrorBox code={h.resourceError}/>}
    <LocalRules controller={h} state={state}/>
    {state.requirements.map(requirement => <RequirementReview key={`${requirement.id}:${requirement.revision}`} controller={h} state={state} requirement={requirement}/>)}
    {state.tasks.filter(task => task.status === 'open').length > 0 && <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-medium">Что нужно сделать</p>{state.tasks.filter(task => task.status === 'open').map(task => <div key={task.id} className="text-sm"><p>{task.public_label}</p>{task.reason && <p className="text-xs text-muted-foreground">{task.reason}</p>}</div>)}</div>}
    <DecisionForm controller={h} state={state}/>
    <Button size="sm" variant="outline" className="gap-2" onClick={() => void loadHistory()}><History className="h-4 w-4"/>История личного дела</Button>
    {history && <div className="space-y-2 rounded-xl border p-3">{history.items.map(event => <div key={event.id} className="text-sm border-b last:border-0 pb-2"><p className="font-medium">{eventLabels[event.kind]} · {stamp(event.recorded_at)}</p>{event.payload.reason && <p className="text-muted-foreground">{event.payload.reason}</p>}{event.payload.decision && <p>{c.admissionOutcomeLabels[event.payload.decision.outcome]}</p>}</div>)}
      {!history.items.length && <p className="text-sm text-muted-foreground">Записей пока нет.</p>}{history.has_more && <Button size="sm" variant="outline" onClick={() => void loadHistory(true)}>Предыдущие записи</Button>}<AdmissionEvidenceHistory controller={h} state={state} events={history.items}/></div>}
  </>;
}
function LocalRules({controller:h,state}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase}) {
  const [options,setOptions] = useState<Extract<c.AdmissionOptions,{kind?:'local_acts'}>|null>(null);
  const [selected,setSelected] = useState<string[]>([]); const [reason,setReason] = useState('');
  const [rows,setRows] = useState<{key:string;kind:c.AdmissionLocalRequirementInput['kind'];staff_label:string;provision:string;exception_policy:'not_defined'|'local_reasoned_exception'}[]>([
    {key:'education_basis',kind:'education_basis',staff_label:c.admissionProcessLabels.education_basis,provision:'',exception_policy:'not_defined'},
    {key:'application',kind:'application',staff_label:c.admissionProcessLabels.application,provision:'',exception_policy:'not_defined'},
    {key:'contract_or_funding',kind:'contract_or_funding',staff_label:c.admissionProcessLabels.contract_or_funding,provision:'',exception_policy:'not_defined'},
  ]);
  const disabled = h.busy || h.pending;
  const load = async (more=false) => {const result = await h.options('local_acts',more ? options?.next_after_id || null : null);if (result?.kind === 'local_acts') setOptions({...result,items:more && options ? [...options.items,...result.items] : result.items});};
  const sources = (options?.items || []).filter(item => selected.includes(item.document_id));
  const save = () => h.mutate({action:'review_local_rules',case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref,
    sources:sources.map(({document_id,version_id,review_id}) => ({document_id,version_id,review_id})), requirements:rows.map(row => ({...row,staff_label:row.staff_label.trim(),provision:row.provision.trim(),source_version_ids:sources.map(source => source.version_id)})),review_reason:reason.trim()});
  return <div className="rounded-xl border p-3 space-y-3"><p className="font-medium text-sm">Правила проверки личного дела</p>
    <p className="text-xs text-muted-foreground">{state.rule_set_id ? 'Сохранена проверенная редакция. Новая редакция сохранит историю и потребует повторной проверки вопросов.' : 'Сначала ответственный выбирает утверждённые локальные акты и проверяет вопросы по этой программе.'} Наличие акта не подтверждает автоматически применимость законодательства.</p>
    {state.capabilities.can_configure_rules && <><Button size="sm" variant="outline" disabled={disabled} onClick={() => void load()}>Выбрать утверждённые акты</Button>
      {options && <div className="space-y-3">
        {!options.items.length && <p className="text-sm text-muted-foreground">Нет доступной утверждённой текущей версии локального акта. Подготовьте и утвердите её в документах организации.</p>}
        {options.items.map(item => <label key={item.document_id} className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={disabled || !selected.includes(item.document_id) && selected.length >= 3} checked={selected.includes(item.document_id)} onChange={event => setSelected(previous => event.target.checked ? [...previous,item.document_id] : previous.filter(id => id !== item.document_id))}/><span>{item.label}<span className="block text-xs text-muted-foreground">Утверждение {item.approval.number} от {item.approval.date}</span></span></label>)}
        {options.has_more && <Button size="sm" variant="outline" onClick={() => void load(true)}>Ещё акты</Button>}
        <p className="text-xs text-muted-foreground">Это вопросы для проверки, а не универсальное требование загрузить документы. Применимость каждого вопроса будет рассмотрена отдельно.</p>
        {rows.map((row,index) => <div key={row.key} className="space-y-2 rounded-lg bg-muted/30 p-3"><Input aria-label={`Вопрос ${index+1}`} value={row.staff_label} maxLength={160} disabled={disabled} onChange={event => setRows(previous => previous.map((value,i) => i===index ? {...value,staff_label:event.target.value} : value))}/>
          <Input aria-label={`Пункт акта ${index+1}`} placeholder="Пункт локального акта / основание проверки" value={row.provision} maxLength={1000} disabled={disabled} onChange={event => setRows(previous => previous.map((value,i) => i===index ? {...value,provision:event.target.value} : value))}/>
          <select aria-label={`Исключение ${index+1}`} className={fieldClass} disabled={disabled} value={row.exception_policy} onChange={event => setRows(previous => previous.map((value,i) => i===index ? {...value,exception_policy:event.target.value as typeof row.exception_policy} : value))}><option value="not_defined">Исключение не предусмотрено</option><option value="local_reasoned_exception">Мотивированное исключение предусмотрено локальным актом</option></select></div>)}
        {rows.length < 50 && <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRows(previous => [...previous,{key:`other_${previous.length}`,kind:'other_reviewed',staff_label:'',provision:'',exception_policy:'not_defined'}])}>Добавить вопрос</Button>}
        <Textarea aria-label="Основание проверки правил" placeholder="Основание применимости выбранных положений к этой программе" value={reason} maxLength={4000} disabled={disabled} onChange={event => setReason(event.target.value)}/>
        <Button size="sm" disabled={disabled || !sources.length || !reason.trim() || rows.some(row => !row.staff_label.trim() || !row.provision.trim())} onClick={() => void save()}>Сохранить проверенную редакцию</Button>
      </div>}</>}
  </div>;
}
function RequirementReview({controller:h,state,requirement}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase;requirement:c.AdmissionRequirement}) {
  const [applicability,setApplicability] = useState(requirement.applicability); const [reason,setReason] = useState('');
  const [selected,setSelected] = useState<string[]>(requirement.evidence_version_ids); const [exception,setException] = useState(false); const [exceptionReason,setExceptionReason] = useState('');
  const disabled = h.busy || h.pending;
  const evidence = state.evidence.filter(item => item.requirement_id === requirement.id);
  return <div className="rounded-xl border p-3 space-y-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-sm">{requirement.label}</p><Badge variant="outline">{c.admissionRequirementLabels[requirement.current_state]}</Badge></div>
    {requirement.public_next_action && <p className="text-xs text-muted-foreground">{requirement.public_next_action}</p>}
    <AdmissionEvidenceSection controller={h} state={state} requirement={requirement}/>
    {state.capabilities.can_review && <div className="space-y-2"><select aria-label={`Применимость: ${requirement.label}`} className={fieldClass} value={applicability} disabled={disabled} onChange={event => setApplicability(event.target.value as typeof applicability)}><option value="unknown">Применимость не определена</option><option value="applicable">Применимо</option><option value="not_applicable">Не применимо с основанием</option></select>
      {evidence.map(item => <label key={item.id} className="flex gap-2 text-xs"><input type="checkbox" checked={selected.includes(item.id)} disabled={disabled} onChange={event => setSelected(previous => event.target.checked ? [...previous,item.id] : previous.filter(id => id !== item.id))}/>Учитывать версию от {stamp(item.captured_at)} · {item.byte_sha256.slice(0,12)}</label>)}
      <Textarea aria-label={`Основание: ${requirement.label}`} placeholder="Основание применимости и результат рассмотрения точных версий" maxLength={4000} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)}/>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={exception} disabled={disabled} onChange={event => setException(event.target.checked)}/>Рассмотреть мотивированное исключение, предусмотренное проверенным актом</label>
      {exception && <Textarea aria-label="Основание исключения" placeholder="Основание исключения; обязательное неизвестное требование нельзя отменить отметкой" maxLength={4000} value={exceptionReason} disabled={disabled} onChange={event => setExceptionReason(event.target.value)}/>}
      <Button size="sm" variant="outline" disabled={disabled || !reason.trim() || exception && (!exceptionReason.trim() || !selected.length)} onClick={() => void h.mutate({action:'review_requirement',case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref,requirement_id:requirement.id,expected_requirement_revision:requirement.revision,applicability,evidence_version_ids:selected,reason:reason.trim(),exception:exception ? {rule_id:requirement.rule_id,reason:exceptionReason.trim(),evidence_version_ids:selected} : null})}>Записать рассмотрение</Button>
    </div>}
  </div>;
}
function DecisionForm({controller:h,state}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase}) {
  const [outcome,setOutcome] = useState<'needs_information'|'admitted'|'not_admitted'>('needs_information'); const [reason,setReason] = useState('');
  const ready = !!state.rule_set_id && state.requirements.length >= 3 && state.requirements.every(requirement => !!requirement.review_event_id && (requirement.applicability === 'not_applicable' || requirement.applicability === 'applicable' && ['satisfied','exception_recorded'].includes(requirement.current_state)));
  if (!state.capabilities.can_decide) return <p className="text-xs text-muted-foreground">Решение записывает назначенный ответственный с действующими правами.</p>;
  return <div className="rounded-xl border p-3 space-y-3"><p className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary"/>Решение ответственного</p>
    <select aria-label="Решение ответственного" className={fieldClass} value={outcome} disabled={h.busy || h.pending} onChange={event => setOutcome(event.target.value as typeof outcome)}><option value="needs_information">Нужны сведения</option><option value="admitted" disabled={!ready}>Подтвердить допуск</option><option value="not_admitted">Не подтверждать допуск</option></select>
    {!ready && <p className="text-xs text-muted-foreground">Для допуска сначала рассмотрите применимость и точные доказательства всех текущих вопросов.</p>}
    <Textarea aria-label="Основание решения" placeholder="Мотивированное основание решения по этой группе и версии программы" maxLength={4000} value={reason} onChange={event => setReason(event.target.value)} disabled={h.busy || h.pending}/>
    <Button size="sm" disabled={h.busy || h.pending || !state.rule_set_id || !state.rule_set_digest || !reason.trim() || outcome === 'admitted' && !ready} onClick={() => state.rule_set_id && state.rule_set_digest && void h.mutate({action:'record_decision',case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref,rule_set_id:state.rule_set_id,rule_set_digest:state.rule_set_digest,requirements_digest:state.requirements_digest,evidence_version_ids:[...new Set(state.requirements.flatMap(requirement => requirement.evidence_version_ids))].sort(),outcome,reason:reason.trim()})}>Записать решение</Button>
  </div>;
}
