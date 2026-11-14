import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button as BaseButton } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  approvalBlock, executeRtnNormativeRequest, freezeRequest, getRtnNormativeEditorial,
  NpaEditorialError, parseDeclaredBasis, publicEvidenceUrl, requestRtnNormativeEditorialCheck,
  type EditorialBank, type EditorialScope, type FrozenRequest,
} from '@/api/rtn-npa';

const field = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm';
function Button(props: ComponentProps<typeof BaseButton>) {
  return <BaseButton {...props} className={`h-auto min-h-10 max-w-full whitespace-normal text-left ${props.className ?? ''}`} />;
}
const message = (e: unknown) => e instanceof Error ? e.message : 'Не удалось выполнить действие.';
const contextKey = (b: EditorialBank) => JSON.stringify([b.bank_id, b.release_id, b.configuration?.id, b.manifest?.id, b.manifest?.version, b.admission.finding_epoch, b.latest_check?.id]);

/** Nested editorial control, never a new global navigation item or an entitlement. */
export function RtnNormativeEditorialPanel({ organizationId, onInteractionLockChange }: { organizationId: string; onInteractionLockChange?: (locked: boolean) => void }) {
  const { user, session, userRole, loading, authError } = useAuth();
  if (!organizationId || loading || authError || !user || userRole !== 'admin' || session?.user.id !== user.id) return null;
  return <EditorialContent key={`${user.id}:${organizationId}`} actorId={user.id} organizationId={organizationId} onInteractionLockChange={onInteractionLockChange} />;
}

function EditorialContent({ actorId, organizationId, onInteractionLockChange }: { actorId: string; organizationId: string; onInteractionLockChange?: (locked: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [resetVersion, setResetVersion] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  // An enclosing editorial toggle must not drop the frozen request while its
  // result is unknown. Auth/organization changes still unmount for isolation.
  useEffect(() => {
    onInteractionLockChange?.(operationBusy || uncertain);
    return () => onInteractionLockChange?.(false);
  }, [operationBusy, uncertain, onInteractionLockChange]);
  const scope: EditorialScope = useMemo(() => ({ actorId, organizationId }), [actorId, organizationId]);
  const query = useQuery({ queryKey: ['rtn-npa-editorial', actorId, organizationId],
    queryFn: ({ signal }) => getRtnNormativeEditorial({ ...scope, signal }), enabled: open, retry: false, staleTime: 0,
    refetchInterval: open ? 15_000 : false, refetchOnWindowFocus: true });
  const bank = query.data?.banks.find(b => b.bank_id === selected);
  useEffect(() => {
    if (query.data && !query.error && selected && !bank) { setSelected(''); setUncertain(false); setResetVersion(v => v + 1); }
  }, [query.data, query.error, selected, bank]);
  async function reload(reset = false) {
    const result = await query.refetch();
    if (!result.error && reset && !uncertain) { setResetVersion(v => v + 1); setUncertain(false); }
  }
  return <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <Button variant="ghost" aria-expanded={open} disabled={operationBusy || uncertain} onClick={() => setOpen(v => !v)}>Нормативные основания · администратор</Button>
    {open && <div className="mt-4 min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">Состав нормативных оснований, официальные подтверждения и ручная отметка сохраняются отдельно. Проверка не утверждает учебные ответы автоматически.</p>
      {query.isPending && <p role="status">Загружаем нормативные редакции…</p>}
      {query.error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{message(query.error)}</p><Button variant="outline" disabled={query.isFetching} onClick={() => reload(false)}>Повторить чтение нормативных данных</Button></div>}
      {query.data && !query.error && <>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button variant="outline" disabled={query.isFetching || operationBusy} onClick={() => reload(true)}>{uncertain ? 'Обновить сведения, сохранив запрос' : 'Обновить данные и сбросить форму'}</Button>
          <p className="self-center text-xs text-muted-foreground">Сведения сервера: {query.data.server_time}</p>
        </div>
        <label className="block min-w-0 space-y-1 text-sm">Учебный нормативный набор
          <select className={field} value={selected} disabled={query.isFetching || uncertain || operationBusy} onChange={e => { setSelected(e.target.value); setResetVersion(v => v + 1); setUncertain(false); }}>
            <option value="">Выберите набор</option>{query.data.banks.map(b => <option key={b.bank_id} value={b.bank_id}>{b.code} · {b.title}</option>)}
          </select>
        </label>
        {!query.data.banks.length && <p>Нормативные наборы пока не зарегистрированы.</p>}
      </>}
      {bank && <BankForm key={`${actorId}:${organizationId}:${bank.bank_id}:${resetVersion}`} bank={bank} scope={scope}
        serverTime={query.data!.server_time} workspaceBlocked={!!query.error || query.isFetching || !open}
        hide={!!query.error} onReload={reload} onUncertain={setUncertain} onBusy={setOperationBusy} />}
    </div>}
  </section>;
}

function BankForm({ bank, scope, serverTime, workspaceBlocked, hide, onReload, onUncertain, onBusy }: {
  bank: EditorialBank; scope: EditorialScope; serverTime: string; workspaceBlocked: boolean; hide: boolean;
  onReload: (reset?: boolean) => Promise<void>; onUncertain: (value: boolean) => void; onBusy: (value: boolean) => void;
}) {
  const [initialContext] = useState(() => contextKey(bank));
  const [basis, setBasis] = useState(() => JSON.stringify(bank.configuration?.basis ?? [], null, 2));
  const [from, setFrom] = useState(bank.configuration?.discovery_from ?? '');
  const [note, setNote] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [evidenceRead, setEvidenceRead] = useState(false);
  const [url, setUrl] = useState('');
  const [citation, setCitation] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualChangesRead, setManualChangesRead] = useState(false);
  const [pending, setPending] = useState(false);
  const [frozen, setFrozen] = useState<FrozenRequest | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [denied, setDenied] = useState(false);
  const inFlight = useRef(false);
  const requestRef = useRef<FrozenRequest | null>(null);
  const mounted = useRef(true);
  const localController = useRef(new AbortController());
  const getLocalScope = () => ({ ...scope, signal: localController.current.signal });
  useEffect(() => {
    mounted.current = true;
    if (localController.current.signal.aborted) localController.current = new AbortController();
    return () => { mounted.current = false; localController.current.abort(); onBusy(false); };
  }, []);
  const stale = contextKey(bank) !== initialContext;
  const blocked = workspaceBlocked || pending || conflict || denied || stale;
  const locked = blocked || !!frozen;
  const check = bank.latest_check;
  // Current worker adapter is deliberately limited to this exact 116-FZ.
  // A syntactically valid FederalLaw identity does not imply adapter coverage.
  const manualDependencies = bank.configuration?.basis.filter(b => !(b.kind === 'FederalLaw' && b.date === '1997-07-21'
    && b.number === '116-ФЗ' && b.docid === 38355)) ?? [];
  const unknownIdentityDependencies = bank.configuration?.basis.filter(b => b.docid === undefined) ?? [];
  const maxDiscoveryDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(serverTime));
  const approvalReason = approvalBlock(bank, check, serverTime);
  async function send(operation: FrozenRequest['operation'], retry = false) {
    if (inFlight.current || workspaceBlocked || denied || !mounted.current || localController.current.signal.aborted || (conflict && !retry)) return;
    inFlight.current = true; setPending(true); onBusy(true); setError(''); setNotice('');
    try {
      let request = requestRef.current;
      if (!retry) {
        if (request || stale) throw new NpaEditorialError('cas', 'Контекст изменился. Явно обновите данные и заполните форму заново.');
        if (operation === 'configure') {
          if (!bank.release_id) throw new Error('Для состава оснований нужен текущий опубликованный учебный выпуск.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || from > maxDiscoveryDate || note.trim().length < 10 || note.length > 4000) throw new Error('Укажите начало поиска не позднее текущей даты и пояснение длиной 10–4000 символов.');
          request = freezeRequest({ operation, args: { p_bank_id: bank.bank_id, p_expected_configuration_id: bank.configuration?.id ?? null,
            p_expected_release_id: bank.release_id, p_basis: parseDeclaredBasis(basis), p_discovery_from: from, p_note: note.trim(), p_request_id: crypto.randomUUID() } });
        } else if (operation === 'approve') {
          if (approvalReason || !check || !bank.configuration || !evidenceRead || approveNote.trim().length < 10) throw new Error(approvalReason || 'Прочитайте подтверждения и укажите заключение сверки.');
          // Fresh genuine-admin read must still match the evidence the operator read.
          const fresh = await getRtnNormativeEditorial(getLocalScope());
          const current = fresh.banks.find(b => b.bank_id === bank.bank_id);
          if (!current || contextKey(current) !== contextKey(bank) || approvalBlock(current, current.latest_check, fresh.server_time))
            throw new NpaEditorialError('cas', 'Последняя проверка или нормативный контекст изменились. Обновите данные и прочитайте подтверждения заново.');
          request = freezeRequest({ operation, args: { p_bank_id: bank.bank_id, p_run_id: check.id,
            p_expected_configuration_id: bank.configuration.id, p_expected_manifest_id: bank.manifest?.id ?? null,
            p_expected_finding_epoch: bank.admission.finding_epoch, p_note: approveNote.trim(), p_request_id: crypto.randomUUID() } });
        } else {
          const safeUrl = publicEvidenceUrl(url);
          if (!bank.release_id || !manualChangesRead || !safeUrl || citation.trim().length < 10 || citation.length > 4000 || manualNote.trim().length < 10 || manualNote.length > 4000) throw new Error('Подтвердите проверку всех текущих изменений и укажите публичную ссылку на первоисточник, пункт документа и заключение длиной 10–4000 символов.');
          request = freezeRequest({ operation, args: { p_bank_id: bank.bank_id, p_release_id: bank.release_id,
            p_expected_finding_epoch: bank.admission.finding_epoch, p_evidence: [{ url: safeUrl, citation: citation.trim() }],
            p_note: manualNote.trim(), p_request_id: crypto.randomUUID() } });
        }
        requestRef.current = request; setFrozen(request);
      }
      if (!request) throw new Error('Нет сохранённого запроса для повторения.');
      await executeRtnNormativeRequest(getLocalScope(), request);
      if (!mounted.current) return;
      requestRef.current = null; setFrozen(null); onUncertain(false);
      if (request.operation === 'configure') setNote('');
      else if (request.operation === 'approve') { setApproveNote(''); setEvidenceRead(false); }
      else { setUrl(''); setCitation(''); setManualNote(''); setManualChangesRead(false); }
      setNotice(request.operation === 'configure' ? 'Состав оснований сохранён. Это не утверждение и не продление срока. Поставьте проверку в очередь.'
        : request.operation === 'approve' ? 'Сверка нормативного состава подтверждена сервером. Учебные ответы этим действием автоматически не изменяются.'
        : 'Ручная проверка текущих изменений сохранена. Сервер пересчитает допуск в пределах оставшегося срока; дата не продлена.');
      await onReload(false);
    } catch (e) {
      if (!mounted.current) return;
      setError(message(e));
      if (e instanceof NpaEditorialError && ['cas', 'rejected'].includes(e.kind)) { setConflict(true); onUncertain(false); }
      else if (e instanceof NpaEditorialError && ['denied', 'context'].includes(e.kind)) { setDenied(true); onUncertain(false); }
      else if (requestRef.current) onUncertain(true);
    } finally { inFlight.current = false; if (mounted.current) { setPending(false); onBusy(false); } }
  }
  async function queue() {
    if (inFlight.current || locked || !bank.configuration || ['queued', 'running'].includes(check?.status || '')) return;
    inFlight.current = true; setPending(true); onBusy(true); setError(''); setNotice('');
    try {
      const result = await requestRtnNormativeEditorialCheck(getLocalScope(), bank.bank_id);
      if (!mounted.current) return;
      setNotice(result.status === 'completed' ? 'Недавняя проверка уже выполнена. Обновляю фактический результат.'
        : result.status === 'running' ? 'Проверка выполняется. Результат ещё не получен.' : 'Проверка поставлена в очередь. Это ещё не подтверждение актуальности.');
      await onReload(false);
    } catch (e) { if (mounted.current) { setError(message(e)); setConflict(true); } }
    finally { inFlight.current = false; if (mounted.current) { setPending(false); onBusy(false); } }
  }
  if (hide || denied) return denied ? <p role="alert">Действия закрыты до повторной проверки прав и загрузки данных.</p> : null;
  return <div className="min-w-0 space-y-4" aria-label="Редактор нормативного состава">
    <p className="break-words text-sm">Текущий предел допуска: <strong>{bank.admission.normative_cutoff_at || 'не установлен'}</strong>. Основание: {{ manual_review: 'ручная проверка', automatic_attestation: 'автоматическая сверка', blocked: 'допуск приостановлен' }[bank.admission.admission_basis]}. {bank.admission.reasons.join('; ')}</p>
    {!!bank.pending_findings.length && <details className="min-w-0"><summary className="cursor-pointer text-sm font-medium">Новые нормативные изменения требуют сверки</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(bank.pending_findings, null, 2)}</pre></details>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="break-words text-sm">{notice}</p>}
    {(stale || conflict) && <p role="alert" className="text-sm">Контекст формы изменился. Нажмите «Обновить данные и сбросить форму» перед новым действием.</p>}
    {frozen && !conflict && <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="break-words text-sm">Запрос сохранён: {frozen.args.p_request_id}. При неизвестном результате повторяются этот номер и все исходные параметры.</p>
      <Button variant="outline" disabled={pending || workspaceBlocked || denied} onClick={() => send(frozen.operation, true)}>Повторить тот же сохранённый запрос</Button>
    </div>}
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">1. Состав нормативных оснований</h3>
      <label className="block space-y-1 text-sm">Проверенный полный перечень нормативных оснований этого набора<textarea className={`${field} min-h-36 font-mono text-xs`} value={basis} disabled={locked} onChange={e => setBasis(e.target.value)} /></label>
      <p className="text-xs text-muted-foreground">Администратор проверяет полноту списка именно этого набора: федеральные законы, постановления, приказы и технические регламенты. Сохранение списка — проект состава, а не подтверждение всех норм.</p>
      <p className="text-xs text-muted-foreground">Формат JSON: country RU, kind, date, number, title. docid указывайте только если точно установлен идентификатор официальной карточки; неизвестный docid пропускайте, не заменяйте его нулём или null. Сейчас автоматический адаптер проверяет только 116-ФЗ от 21.07.1997 с подтверждённым идентификатором 38355. Другие федеральные законы, постановления, приказы и технические регламенты ещё не поддержаны и не создают автоматического продления. Проверка не выводит полный перечень оснований из свободного текста.</p>
      {!!unknownIdentityDependencies.length && <p className="text-sm text-muted-foreground">Для {unknownIdentityDependencies.length} оснований идентификатор не установлен. Метаданные без идентификатора не проверены автоматически. Они не дают нового автоматического продления; учитывается только подтверждённый сервером остаток срока предметной проверки.</p>}
      {!!manualDependencies.length && <div className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">Документы без автоматического продления:</p><ul className="list-disc space-y-1 pl-5">{manualDependencies.map((b, i) => <li className="break-words" key={`${b.kind}:${b.date}:${b.number}:${i}`}>{b.title} · {b.date} № {b.number} ({b.kind}){b.docid === undefined ? ' · идентификатор не установлен' : ''}</li>)}</ul></div>}
      <label className="block space-y-1 text-sm">Искать изменения с<input type="date" max={maxDiscoveryDate} className={field} value={from} disabled={locked} onChange={e => setFrom(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Основание изменения состава<textarea className={field} maxLength={4000} value={note} disabled={locked} onChange={e => setNote(e.target.value)} /></label>
      <Button disabled={locked || !bank.release_id || !basis.trim() || !from || note.trim().length < 10} onClick={() => send('configure')}>Сохранить новый состав оснований</Button>
    </section>
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">2. Проверка первоисточников</h3>
      <Button variant="outline" disabled={locked || !bank.configuration || ['queued', 'running'].includes(check?.status || '')} onClick={queue}>Проверить нормативные источники сейчас</Button>
      <p role="status" className="text-sm">{!check ? 'Проверок пока нет.' : check.status === 'queued' ? 'В очереди. Актуальность ещё не подтверждена.' : check.status === 'running' ? 'Выполняется. Актуальность ещё не подтверждена.' : `Завершена: ${check.outcome || 'результат не подтверждён'}. ${check.reason_codes.join('; ')}`}</p>
      {check && <details className="min-w-0" onToggle={e => { if (!(e.currentTarget as HTMLDetailsElement).open) setEvidenceRead(false); }}>
        <summary className="cursor-pointer text-sm font-medium">Официальные подтверждения последней проверки</summary>
        <p className="break-words text-xs">Проверка {check.id}; конфигурация {check.configuration_id}; завершена {check.completed_at || 'ещё не завершена'}.</p>
        <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify({ observations: check.observations, discovery_evidence: check.discovery_evidence, reason_codes: check.reason_codes, error_code: check.error_code }, null, 2)}</pre>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={evidenceRead} disabled={locked || !!approvalReason} onChange={e => setEvidenceRead(e.target.checked)} />Я прочитал подтверждения и проверил применимость к текущей учебной редакции</label>
      </details>}
      {approvalReason && <p className="text-sm text-muted-foreground">{approvalReason}</p>}
      <label className="block space-y-1 text-sm">Заключение сверки нормативного состава<textarea className={field} maxLength={4000} value={approveNote} disabled={locked || !!approvalReason} onChange={e => setApproveNote(e.target.value)} /></label>
      <Button disabled={locked || !!approvalReason || !evidenceRead || approveNote.trim().length < 10} onClick={() => send('approve')}>Утвердить сверенный нормативный состав</Button>
    </section>
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold">3. Ручная проверка текущих изменений без продления срока</h3>
      <p className="text-sm text-muted-foreground">Подтверждение относится ко всем показанным текущим нормативным изменениям выбранного набора, эпоха {bank.admission.finding_epoch}. Оно может восстановить допуск в пределах оставшегося срока ручной проверки. Дата не продлевается: действие не добавляет семь дней и не заменяет автоматическую сверку.</p>
      <p className="text-xs text-muted-foreground">В этой форме принимаются публичные страницы портала правовой информации и Ростехнадзора. Приватные подписанные ссылки не подходят.</p>
      <label className="block space-y-1 text-sm">Публичная ссылка на прочитанный первоисточник<input type="url" className={field} value={url} disabled={locked} onChange={e => setUrl(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Документ и проверенный пункт<input className={field} maxLength={4000} value={citation} disabled={locked} onChange={e => setCitation(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Заключение ручной проверки<textarea className={field} maxLength={4000} value={manualNote} disabled={locked} onChange={e => setManualNote(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={manualChangesRead} disabled={locked} onChange={e => setManualChangesRead(e.target.checked)} />Я предметно проверил все показанные текущие изменения этого набора и подтверждаю их применимость</label>
      <Button variant="outline" disabled={locked || !bank.release_id || !manualChangesRead || !publicEvidenceUrl(url) || citation.trim().length < 10 || manualNote.trim().length < 10} onClick={() => send('acknowledge')}>Сохранить ручную отметку без продления</Button>
    </section>
    {pending && <p role="status">Запрос выполняется. Дождитесь подтверждения сервера.</p>}
  </div>;
}
