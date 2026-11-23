import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureEvidencePanel } from '@/components/organization/SignatureEvidencePanel';
import { issuanceScopeCurrent, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';
import type { PolicyVersion } from '@/lib/signatureAssurance/types';
import {
  issuedRecipientRecordAvailable, normalizeIssuedRecipientError, prepareIssuedRecipientRequest,
  readIssuedRecipientPolicies, readIssuedRecipientRequest, resumeIssuedRecipientRequest, type IssuedRecipientIntent,
} from '@/lib/educationIssuance/recipientRequest';

const states: Record<IssuedRecipientIntent['state'], string> = {
  draft: 'Черновик сохранён. Запрос ученику ещё не отправлен.',
  source_verified: 'PDF проверен. Осталось отправить запрос ученику.',
  bound: 'Документ и правила закреплены. Осталось отправить запрос ученику.',
  pending: 'Запрос доступен в личном кабинете ученика. Ожидаем подтверждение.',
  confirmed: 'Ученик подтвердил получение электронной копии по правилам ПЭП.',
  rejected: 'Ученик отклонил запрос. История сохранена.',
  expired: 'Срок подтверждения истёк. История сохранена.',
  revoked: 'Запрос отозван. История сохранена.',
  source_changed: 'Версия документа изменилась. Прежний запрос сохранён.',
  source_unavailable: 'Точная версия PDF сейчас недоступна. Запрос нельзя продолжить.',
  closed: 'Запрос закрыт. История сохранена.',
};
type Props = { scope: EducationIssuanceScope; record: IssuanceRecord; disabled?: boolean; onLockChange?: (locked: boolean) => void };

/** One issued PDF and one durable learner request. No mail or legal decision is inferred from this action. */
export function IssuedRecipientRequest({ scope, record, disabled = false, onLockChange }: Props) {
  const selectId = useId(), daysId = useId();
  const key = JSON.stringify([scope.actorId, scope.accessRevision, scope.organizationId, scope.issuanceScope, record.official.id, record.revision, record.state_hash, record.lifecycle, record.provenance, record.artifact]);
  const latestKey = useRef(key); latestKey.current = key;
  const epoch = useRef(0), flight = useRef(false);
  const operation = useRef<ReturnType<typeof prepareIssuedRecipientRequest> | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; intent: IssuedRecipientIntent | null; loaded: boolean } | null>(null);
  const [policies, setPolicies] = useState<PolicyVersion[]>([]), [nextPolicyId, setNextPolicyId] = useState<string | null>(null), [canPrepare, setCanPrepare] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState(''), [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [evidenceOpen, setEvidenceOpen] = useState(false);
  const scopeAvailable = issuanceScopeCurrent(scope) && record.capabilities.can_read && record.provenance === 'controlled_issuance';
  const current = (run: number) => run === epoch.current && latestKey.current === key && issuanceScopeCurrent(scope);
  const intent = scopeAvailable && snapshot?.key === key ? snapshot.intent : null;
  const loaded = scopeAvailable && snapshot?.key === key && snapshot.loaded;
  const available = issuedRecipientRecordAvailable(scope, record);
  const selected = policies.find(policy => policy.id === selectedPolicyId);
  const load = async (run = epoch.current) => {
    if (!current(run) || flight.current) return;
    flight.current = true; setBusy(true); setError(null);
    try {
      const saved = await readIssuedRecipientRequest(scope, { kind: 'record', record_id: record.official.id }, record);
      if (!current(run)) return;
      setSnapshot({ key, intent: saved, loaded: true });
      if (saved) { operation.current = null; setPolicies([]); setNextPolicyId(null); setSelectedPolicyId(''); }
      else if (available) {
        const page = await readIssuedRecipientPolicies(scope); if (!current(run)) return;
        setPolicies(page.items); setNextPolicyId(page.nextAfterId); setCanPrepare(page.canPrepare);
        setSelectedPolicyId(previous => page.items.some(policy => policy.id === previous) ? previous : '');
      }
    } catch (cause) { if (current(run)) setError(normalizeIssuedRecipientError(cause).message); }
    finally { if (current(run)) { flight.current = false; setBusy(false); } }
  };
  useEffect(() => {
    const run = ++epoch.current; flight.current = false; operation.current = null; setSnapshot(null); setPolicies([]); setNextPolicyId(null); setCanPrepare(false);
    setSelectedPolicyId(''); setDays('30'); setBusy(false); setError(null); setEvidenceOpen(false);
    if (scopeAvailable) void load(run);
    return () => { ++epoch.current; flight.current = false; onLockChange?.(false); };
    // The immutable source key includes actor/access, record generation and scope. Old responses never become the next record's state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scopeAvailable]);
  const morePolicies = async () => {
    if (!nextPolicyId || busy || flight.current || disabled) return;
    const run = epoch.current; flight.current = true; setBusy(true); setError(null);
    try {
      const page = await readIssuedRecipientPolicies(scope, nextPolicyId); if (!current(run)) return;
      setPolicies(previous => [...previous, ...page.items.filter(policy => !previous.some(old => old.id === policy.id))]); setNextPolicyId(page.nextAfterId); setCanPrepare(page.canPrepare);
    } catch (cause) { if (current(run)) setError(normalizeIssuedRecipientError(cause).message); }
    finally { if (current(run)) { flight.current = false; setBusy(false); } }
  };
  const send = async () => {
    if (busy || flight.current || disabled || !loaded || error || intent && !intent.capabilities.can_resume) return;
    if (!intent && (!available || !canPrepare || !operation.current && (!selected || !/^\d+$/.test(days) || +days < 1 || +days > 90))) return;
    const run = epoch.current; flight.current = true; setBusy(true); setError(null); onLockChange?.(true);
    try {
      let saved = intent;
      if (!saved) {
        operation.current ??= prepareIssuedRecipientRequest(scope, record, selected!, +days);
        saved = await operation.current.run(); if (!current(run)) return;
        setSnapshot({ key, intent: saved, loaded: true }); operation.current = null;
      }
      saved = await resumeIssuedRecipientRequest(scope, saved); if (!current(run)) return;
      setSnapshot({ key, intent: saved, loaded: true });
    } catch (cause) {
      if (current(run)) {
        const failure = normalizeIssuedRecipientError(cause);
        // An unknown transport result keeps its exact operation. A definitive rejection may be reselected only after a fresh read.
        if (failure.code !== 'DEPENDENCY_UNAVAILABLE') operation.current = null;
        setError(failure.message);
      }
    }
    finally { if (current(run)) { flight.current = false; setBusy(false); onLockChange?.(false); } }
  };
  if (!scopeAvailable) return null;
  const unavailable = !intent && loaded && !available;
  return <section className="space-y-3 rounded-xl border p-4" aria-label="Получение электронной копии">
    <h3 className="font-medium">Получение электронной копии</h3>
    <p className="text-sm text-muted-foreground">Запрос появится у ученика в документах и колокольчике. Подтверждение копии не заменяет отметку о вручении бумажного документа.</p>
    {!loaded && !error && <p role="status" className="text-sm">Проверяем сохранённый запрос…</p>}
    {intent && <><p role="status" className="text-sm">{states[intent.state]}</p>
      {!intent.capabilities.can_resume && ['draft', 'source_verified', 'bound'].includes(intent.state) && <p className="text-sm text-muted-foreground">Продолжение недоступно. Проверьте принятые правила ПЭП и права на изменение и подпись документов.</p>}
      {intent.signature.sent_at && <p className="text-xs text-muted-foreground">Отправлено в кабинет: {new Date(intent.signature.sent_at).toLocaleString('ru-RU')} · срок до {new Date(intent.signature.expires_at).toLocaleString('ru-RU')}.</p>}
      {intent.confirmation_event && <p className="text-xs text-muted-foreground">Событие подтверждения: {new Date(intent.confirmation_event.server_at).toLocaleString('ru-RU')}.</p>}
    </>}
    {unavailable && <p className="text-sm text-muted-foreground">Для этого документа нет доступного активного закреплённого PDF. Прежние файлы и история сохранены.</p>}
    {!intent && loaded && available && <>
      {!canPrepare && !busy && !error && <p className="text-sm text-muted-foreground">Для отправки запроса нужны права на подпись документов. Просмотр документа доступен.</p>}
      {canPrepare && <><div className="space-y-2"><Label htmlFor={selectId}>Принятые правила ПЭП</Label><select id={selectId} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={selectedPolicyId} disabled={busy || disabled || !!operation.current} onChange={event => setSelectedPolicyId(event.target.value)}><option value="">Выберите редакцию правил</option>{policies.map(policy => <option key={policy.id} value={policy.id}>{policy.body.classification.subtype} · редакция {policy.version}</option>)}</select>
        {!policies.length && !busy && !error && <p className="text-sm text-muted-foreground">Подходящие правила ещё не приняты организацией. Сначала настройте ПЭП в разделе подписей.</p>}
        {nextPolicyId && <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => void morePolicies()}>Ещё правила</Button>}
      </div>
      {selected && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">Посмотреть выбранные правила</summary><p className="mt-2 whitespace-pre-wrap">{selected.body.limitations}</p>{selected.body.agreement && <p className="mt-2 whitespace-pre-wrap">{selected.body.agreement.text}</p>}</details>}
      <div className="space-y-2"><Label htmlFor={daysId}>Срок подтверждения, дней</Label><Input id={daysId} className="max-w-32" type="number" min={1} max={90} value={days} disabled={busy || disabled || !!operation.current} onChange={event => setDays(event.target.value)} /></div></>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {((intent?.capabilities.can_resume) || !intent && loaded && available && canPrepare) && <Button size="sm" disabled={busy || disabled || !!error || !intent && !operation.current && (!selected || !/^\d+$/.test(days) || +days < 1 || +days > 90)} onClick={() => void send()}>{busy ? 'Подготавливаем запрос…' : intent ? 'Продолжить отправку запроса' : operation.current ? 'Повторить ту же подготовку' : 'Запросить подтверждение у ученика'}</Button>}
      <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => void load()}>Проверить состояние</Button>
      {intent?.capabilities.can_open_staff_evidence && <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => setEvidenceOpen(value => !value)}>{evidenceOpen ? 'Скрыть подтверждения' : 'Открыть подтверждения'}</Button>}
    </div>
    {intent?.capabilities.can_open_staff_evidence && evidenceOpen && <SignatureEvidencePanel key={intent.signature.id} organizationId={scope.organizationId} signatureId={intent.signature.id} />}
  </section>;
}
