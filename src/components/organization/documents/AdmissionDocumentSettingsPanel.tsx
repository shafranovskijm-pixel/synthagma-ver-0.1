import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor } from '@/utils/courseCache';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { htmlToDocxBlob, downloadBlob, sanitizeFileName } from '@/lib/docx/htmlToDocx';
import { toast } from 'sonner';
import { applyAdmissionDocumentSettings, captureAdmissionDocumentScope, assertAdmissionDocumentScopeCurrent, readAdmissionDocumentSettings, readAutomaticAdmissionDraft,
  admissionDocumentErrorMessages, normalizeAdmissionDocumentError } from '@/lib/admissionDocuments/client';
import { wireScope, missingFactLabels, type AdmissionDocumentScope, type AdmissionDocumentSettings, type AdmissionDocumentPreferences,
  type AdmissionDocumentCommand } from '@/lib/admissionDocuments/contract';
import { renderAdmissionDraft } from '@/lib/admissionDocuments/render';

export interface AdmissionDocumentSettingsPanelProps { organizationId: string; scope: AdmissionDocumentScope; onChanged?: () => void }
type Pending = { requestId: string; expectedRevision: number; command: AdmissionDocumentCommand };
const sourceLabel = { default: 'по умолчанию', organization: 'из настроек организации', group: 'из настроек группы', enrollment: 'индивидуально', enrollment_event: 'день фиксации зачисления системой' };
const initialPreferences: AdmissionDocumentPreferences = { enabled: null, document_date: null, effective_admission_date: null, timezone: null };
const dateLabel=(value:string|null)=>value?`${value.slice(8,10)}.${value.slice(5,7)}.${value.slice(0,4)}`:null;
const timezones=[['Europe/Kaliningrad','Калининград (UTC+2)'],['Europe/Moscow','Москва (UTC+3)'],['Europe/Samara','Самара (UTC+4)'],['Asia/Yekaterinburg','Екатеринбург (UTC+5)'],['Asia/Omsk','Омск (UTC+6)'],['Asia/Novosibirsk','Новосибирск (UTC+7)'],['Asia/Krasnoyarsk','Красноярск (UTC+7)'],['Asia/Irkutsk','Иркутск (UTC+8)'],['Asia/Yakutsk','Якутск (UTC+9)'],['Asia/Vladivostok','Владивосток (UTC+10)'],['Asia/Magadan','Магадан (UTC+11)'],['Asia/Kamchatka','Камчатка (UTC+12)']];
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function AdmissionDocumentSettingsPanel(props: AdmissionDocumentSettingsPanelProps) {
  const {user,loading}=useAuth();
  const revision=captureOfflineActor(user?.id);
  return <AdmissionDocumentSettingsPanelView key={JSON.stringify([user?.id,revision,loading,props.organizationId,props.scope])} {...props}/>;
}

export function StudentAdmissionAutomationCard({organizationId,enrollmentId,groupId=null}:{organizationId:string;enrollmentId:string;groupId?:string|null}) {
  return <AdmissionDocumentSettingsPanel organizationId={organizationId} scope={{kind:'enrollment',enrollmentId,groupId}}/>;
}

function AdmissionDocumentSettingsPanelView({ organizationId, scope, onChanged }: AdmissionDocumentSettingsPanelProps) {
  const baseKey = JSON.stringify([organizationId,scope]);
  const [selection, setSelection] = useState<{ key: string; groupId: string | null }>({ key: baseKey,groupId: scope.kind === 'enrollment' ? scope.groupId ?? null : null });
  const selectedGroup = scope.kind === 'enrollment' ? selection.key === baseKey ? selection.groupId : scope.groupId ?? null : null;
  const selectedScope: AdmissionDocumentScope = scope.kind === 'enrollment' ? { ...scope,groupId: selectedGroup } : scope;
  let contextKey: string;
  try { contextKey = JSON.stringify([organizationId,wireScope(selectedScope)]); } catch { contextKey = 'invalid'; }
  const currentKey = useRef(contextKey); currentKey.current = contextKey;
  const mounted = useRef(true); const generation = useRef(0); const busyRef = useRef(false);
  const [state, setState] = useState<{ key: string; data: AdmissionDocumentSettings | null; loading: boolean; error: string | null }>({ key: contextKey,data: null,loading: true,error: null });
  const [form, setForm] = useState<{ key: string; value: AdmissionDocumentPreferences }>({ key: contextKey,value: initialPreferences });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ key: string; value: Pending } | null>(null);
  const [preview, setPreview] = useState<{ key: string; html: string } | null>(null);
  const [reload, setReload] = useState(0);
  const data = state.key === contextKey ? state.data : null;
  const loading = state.key !== contextKey || state.loading;
  const error = state.key === contextKey ? state.error : null;
  const preferences = form.key === contextKey ? form.value : initialPreferences;
  const pendingRequest = pending?.key === contextKey ? pending.value : null;
  const isCurrent = (key: string) => mounted.current && currentKey.current === key;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    const key = contextKey; const request = ++generation.current;
    setState({ key,data: null,loading: true,error: null }); setPending(null); setPreview(null); setBusy(false); busyRef.current = false;
    if (key === 'invalid') { setState({ key,data: null,loading: false,error: 'Выберите организацию и обучение.' }); return; }
    void (async () => {
      try {
        const actor = captureAdmissionDocumentScope(organizationId,selectedScope,() => isCurrent(key) && generation.current === request);
        const next = await readAdmissionDocumentSettings(actor);
        if (!isCurrent(key) || generation.current !== request) return;
        setState({ key,data: next,loading: false,error: null }); setForm({ key,value: next.preferences });
        if (scope.kind === 'enrollment' && !selectedGroup && next.draft?.group_id && next.groups.some(group => group.id === next.draft?.group_id)) {
          setSelection({ key: baseKey,groupId: next.draft.group_id });
        }
      } catch (cause) {
        if (isCurrent(key) && generation.current === request) setState({ key,data: null,loading: false,error: admissionDocumentErrorMessages[normalizeAdmissionDocumentError(cause).code] });
      }
    })();
    return () => { generation.current += 1; };
    // The normalized key owns scope and selection; object identity must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey,reload]);
  const update = (patch: Partial<AdmissionDocumentPreferences>) => setForm(previous => {
    if (!isCurrent(contextKey)) return previous;
    return { key: contextKey,value: { ...(previous.key === contextKey ? previous.value : initialPreferences),...patch } };
  });
  const perform = async (command: AdmissionDocumentCommand, retry?: Pending) => {
    if (!data || loading || busyRef.current || pendingRequest && !retry) return;
    const key = contextKey; busyRef.current = true; setBusy(true);
    let intent = retry ?? { requestId: crypto.randomUUID(),expectedRevision: data.revision,command };
    let visited = 0; const cursors=new Set<string>();
    try {
      const actor = captureAdmissionDocumentScope(organizationId,selectedScope,() => isCurrent(key));
      for (;;) {
        if (!isCurrent(key)) return;
        setPending({ key,value: intent });
        const result = await applyAdmissionDocumentSettings(actor,intent.expectedRevision,intent.requestId,intent.command);
        if (!isCurrent(key)) return;
        setState({ key,data: result.state,loading: false,error: null }); setForm({ key,value: result.state.preferences });
        visited += result.processed;
        if (!result.next_after_enrollment_id) break;
        if(cursors.has(result.next_after_enrollment_id)) throw new Error('Repeated pagination cursor');
        cursors.add(result.next_after_enrollment_id);
        intent = { requestId: crypto.randomUUID(),expectedRevision: result.state.revision,
          command: { action: 'apply_current',reason: 'apply_to_pending',after_enrollment_id: result.next_after_enrollment_id } };
      }
      setPending(null); onChanged?.();
      toast.success(command.action === 'apply_current' ? `Проверено проектов: ${visited}` : command.action === 'prepare_existing' ? 'Проект подготовлен — проверьте сведения' : 'Настройки документов сохранены');
    } catch (cause) {
      if (!isCurrent(key)) return;
      const normalized = normalizeAdmissionDocumentError(cause);
      setState(previous => ({ ...previous,error: admissionDocumentErrorMessages[normalized.code] }));
      if (normalized.code !== 'DEPENDENCY_UNAVAILABLE') setPending(null);
    } finally { if (isCurrent(key)) { busyRef.current = false; setBusy(false); } }
  };
  const openDraft = async (download = false) => {
    if (!data?.draft || busyRef.current || pendingRequest) return;
    const key = contextKey; busyRef.current = true; setBusy(true);
    try {
      const actor = captureAdmissionDocumentScope(organizationId,selectedScope,() => isCurrent(key));
      const document = await readAutomaticAdmissionDraft(actor,data.draft);
      if (!isCurrent(key)) return;
      const html = renderAdmissionDraft(document);
      if (download) {
        const blob=await htmlToDocxBlob(html);
        assertAdmissionDocumentScopeCurrent(actor);
        downloadBlob(blob,sanitizeFileName(`Проект_приказа_о_зачислении_${document.document_date}`,'docx'));
        toast.success('Подготовлен Word-проект приказа');
      } else setPreview({ key,html });
    } catch (cause) { if (isCurrent(key)) setState(previous => ({ ...previous,error: admissionDocumentErrorMessages[normalizeAdmissionDocumentError(cause).code] })); }
    finally { if (isCurrent(key)) { busyRef.current = false; setBusy(false); } }
  };
  const locked = Boolean(data?.draft?.registered_locked);
  const writable = !loading && !busy && !pendingRequest && !!data?.capabilities.can_write && !locked;
  const canOpen = !!data?.draft && data.draft.status !== 'disabled' && (scope.kind!=='enrollment'||data.draft.group_id===selectedGroup) && !data.draft.stale && !locked && !busy && !pendingRequest;
  return <Card className="space-y-4 rounded-2xl border-border p-4 sm:p-5" aria-label="Настройки приказа о зачислении">
    <div><h3 className="font-semibold">Приказ о зачислении</h3><p className="mt-1 text-sm text-muted-foreground">При зачислении на курс создаётся проект. Утверждение, подпись и номер — отдельные действия. Журналы обновляются по фактам обучения независимо от этой настройки.</p></div>
    {loading && <div role="status" className="flex items-center gap-2 text-sm"><SigmaSpinner size="sm" />Проверяем настройки документов…</div>}
    {error && <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3"><p className="text-sm">{error}</p>{pendingRequest
      ? <Button variant="outline" disabled={busy} onClick={() => void perform(pendingRequest.command,pendingRequest)}>Повторить действие</Button>
      : <Button variant="outline" disabled={busy} onClick={() => setReload(value => value+1)}>Обновить сведения</Button>}</div>}
    {data && <>
      {scope.kind === 'enrollment' && <label className="block space-y-1.5 text-sm"><span>Группа для приказа</span><select aria-label="Группа для приказа" className={selectClass} value={selectedGroup ?? ''} disabled={busy || !!pendingRequest || locked}
        onChange={event => setSelection({ key: baseKey,groupId: event.target.value || null })}><option value="">Выберите группу</option>{data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
      <label className="block space-y-1.5 text-sm"><span>Готовить проекты приказов автоматически</span><select aria-label="Готовить проекты приказов автоматически" className={selectClass} disabled={!writable} value={preferences.enabled === null ? 'inherit' : preferences.enabled ? 'on' : 'off'}
        onChange={event => update({ enabled: event.target.value === 'inherit' ? null : event.target.value === 'on' })}>
        <option value="inherit">{scope.kind === 'organization' ? 'По умолчанию — включено' : 'Как в настройках выше'}</option><option value="on">Включено</option><option value="off">Выключено — готовить вручную</option></select></label>
      <p className="text-xs text-muted-foreground">Сейчас: {data.effective.enabled ? 'автоматическая подготовка включена' : 'автоматическая подготовка выключена'} ({sourceLabel[data.effective.sources.enabled]}). Изменение настроек не переписывает старые документы.</p>
      {scope.kind === 'organization' ? <label className="block space-y-1.5 text-sm"><span>Часовой пояс организации</span><select aria-label="Часовой пояс организации" className={selectClass} disabled={!writable} value={preferences.timezone??'inherit'} onChange={event=>update({timezone:event.target.value==='inherit'?null:event.target.value})}><option value="inherit">По умолчанию — Москва (UTC+3)</option>{preferences.timezone&&!timezones.some(([value])=>value===preferences.timezone)&&<option value={preferences.timezone}>{preferences.timezone}</option>}{timezones.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        : <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5 text-sm"><span>Дата проекта приказа</span><Input type="date" aria-label="Дата проекта приказа" disabled={!writable} value={preferences.document_date ?? ''} onChange={event => update({ document_date: event.target.value || null })} /><span className="text-xs text-muted-foreground">Пусто — {dateLabel(data.effective.document_date) ?? 'день фиксации системой'} ({sourceLabel[data.effective.sources.document_date]}).</span></label>
          <label className="block space-y-1.5 text-sm"><span>Зачислить с даты</span><Input type="date" aria-label="Зачислить с даты" disabled={!writable} value={preferences.effective_admission_date ?? ''} onChange={event => update({ effective_admission_date: event.target.value || null })} /><span className="text-xs text-muted-foreground">Пусто — {dateLabel(data.effective.effective_admission_date) ?? 'день фиксации системой'} ({sourceLabel[data.effective.sources.effective_admission_date]}).</span></label></div>}
      {data.individual_date_overrides!==null && data.individual_date_overrides>0 && <p className="text-sm text-muted-foreground">В группе есть индивидуальные даты ({data.individual_date_overrides}). Групповой документ не должен подменять их: используйте проекты из карточек учеников.</p>}
      {locked && <p role="status" className="text-sm text-muted-foreground">Приказ уже зарегистрирован. Его даты и сохранённый файл здесь не изменяются.</p>}
      {!data.capabilities.can_write && !locked && <p className="text-sm text-muted-foreground">{scope.kind === 'enrollment' && !selectedGroup ? 'Для индивидуальных дат выберите группу этого обучения.' : 'Настройки доступны для просмотра. Изменение выполняет уполномоченный сотрудник.'}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!writable} onClick={() => void perform({ ...preferences,action: 'save',reason: 'manual_settings' })}>{busy && <SigmaSpinner size="sm" />}Сохранить настройки приказа</Button>
        <Button variant="outline" disabled={!writable} onClick={() => void perform({ action: 'reset',reason: 'inherit_reset' })}>Вернуть настройки выше</Button></div>
      {scope.kind !== 'enrollment' && data.capabilities.can_apply_current && <div className="space-y-2 border-t border-border pt-3"><p className="text-xs text-muted-foreground">По умолчанию настройки применяются к будущим зачислениям. Текущие незарегистрированные проекты можно обновить отдельно; сохранённые официальные документы не меняются.</p><Button variant="outline" disabled={busy || !!pendingRequest} onClick={() => void perform({ action: 'apply_current',reason: 'apply_to_pending',after_enrollment_id: null })}>Применить к текущим проектам</Button></div>}
      {scope.kind === 'enrollment' && <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm">{!data.draft ? 'В этой области проект приказа не показан. Уполномоченный сотрудник может проверить сведения и подготовить проект.' : data.draft.status === 'disabled' ? 'Автоматический проект выключен. Можно подготовить проект вручную.' : data.draft.group_id!==selectedGroup ? 'Для выбранной группы проект нужно обновить.' : data.draft.stale ? 'Сведения изменились — проект нужно обновить.' : data.draft.status === 'needs_information' ? 'Проект подготовлен; часть сведений требует проверки.' : 'Проект подготовлен. Официальное оформление выполняется отдельно.'}</p>
        {data.draft?.live_missing_facts.map(code => <p key={code} className="text-xs text-muted-foreground">{missingFactLabels[code]}</p>)}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!data.capabilities.can_prepare || locked || busy || !!pendingRequest} onClick={() => void perform({ action: 'prepare_existing',reason: 'prepare_existing' })}>{data.draft ? 'Обновить проект' : 'Подготовить проект'}</Button>
          <Button variant="outline" disabled={!canOpen} onClick={() => void openDraft()}>Открыть проект приказа</Button><Button variant="outline" disabled={!canOpen} onClick={() => void openDraft(true)}>Скачать проект DOCX</Button></div>
      </div>}
    </>}
    <Dialog open={preview?.key === contextKey} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Проект приказа о зачислении</DialogTitle><DialogDescription>Только выбранный обучающийся. Проект не подписан, регистрационный номер не присвоен.</DialogDescription></DialogHeader><iframe title="Проект приказа о зачислении" className="h-[65vh] w-full rounded-xl border border-border bg-white" sandbox="" srcDoc={preview?.key === contextKey ? preview.html : ''} /><Button variant="outline" disabled={!canOpen} onClick={() => void openDraft(true)}>Скачать проект DOCX</Button></DialogContent></Dialog>
  </Card>;
}
