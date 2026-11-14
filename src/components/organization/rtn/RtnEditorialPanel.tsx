import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getRtnEditorial, openRtnPaidRollout, publishRtnModule, reviewRtnModule, rtnEditorialWorker, type RtnRolloutRequest } from '@/api/rtn-editorial';
import { RtnNormativeEditorialPanel } from './RtnNormativeEditorialPanel';

const field = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';
function parsePackage(text: string): Record<string, unknown> {
  if (text.length > 2_000_000) throw new Error('Пакет слишком большой.');
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object') throw new Error(); return data; }
  catch { throw new Error('Проверьте формат JSON-пакета.'); }
}

/** Editorial publishing is a separate, actual-admin RPC, never organization entitlement. */
export function RtnEditorialPanel({ organizationId }: { organizationId: string }) {
  const { user, userRole, authError } = useAuth();
  if (!user || userRole !== 'admin' || authError) return null;
  return <RtnEditorialContent key={`${user.id}:${organizationId}`} actorId={user.id} organizationId={organizationId} />;
}

function RtnEditorialContent({ actorId, organizationId }: { actorId: string; organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'normalize' | 'correct' | 'review'>('normalize');
  const [selection, setSelection] = useState('');
  const [text, setText] = useState('');
  const [keyId, setKeyId] = useState('');
  const [effective, setEffective] = useState('');
  const [note, setNote] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [packageError, setPackageError] = useState('');
  const [notice, setNotice] = useState('');
  const [qaReceipt, setQaReceipt] = useState('');
  const [techReceipt, setTechReceipt] = useState('');
  const [rolloutReason, setRolloutReason] = useState('');
  const [rolloutRequest, setRolloutRequest] = useState<RtnRolloutRequest | null>(null);
  const [npaInteractionLocked, setNpaInteractionLocked] = useState(false);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['rtn-editorial', actorId], queryFn: getRtnEditorial, enabled: open, retry: false, staleTime: 0 });
  async function refresh() { await client.invalidateQueries({ queryKey: ['rtn-editorial'] }); await client.invalidateQueries({ queryKey: ['rtn-workspace'] }); }
  const mutation = useMutation({
    mutationFn: async (action: 'bootstrap' | 'save' | 'publish' | 'rollout') => {
      setNotice('');
      if (action === 'rollout') {
        const gate = query.data?.rollout;
        if (!gate || gate.stage !== 'pilot' || !gate.quota_integration_ready || !gate.privacy_integration_ready) throw new Error('Проверки интеграции ещё не завершены. Массовое включение недоступно.');
        if (!qaReceipt.trim() || !techReceipt.trim() || rolloutReason.trim().length < 10) throw new Error('Укажите подтверждения проверки QA, Техносервиса и основание включения.');
        const request = rolloutRequest || { id: crypto.randomUUID(), expectedRevision: gate.revision, reason: rolloutReason,
          evidence: { qa_acceptance_receipt: qaReceipt, technoservice_acceptance_receipt: techReceipt } };
        setRolloutRequest(request);
        await openRtnPaidRollout(request);
        return 'Раздел включён для организаций с действующим оплаченным доступом и постоплатой. Отдельной доплаты нет.';
      }
      if (action === 'bootstrap') {
        await rtnEditorialWorker({ operation: 'bootstrap' });
        return 'Официальные источники зарегистрированы. Проверка поставлена в очередь.';
      }
      if (action === 'publish') {
        if (!keyId || !/^\d{4}-\d{2}-\d{2}$/.test(effective) || note.trim().length < 10) throw new Error('Выберите проверенный набор, дату применения и пояснение выпуска.');
        if (!query.data?.key_sets.some(item => item.id === keyId) || query.data.releases.some(item => item.key_set_id === keyId)) throw new Error('Обновите список: этот набор уже выпущен или недоступен.');
        if (query.data.key_sets.find(item => item.id === keyId)?.normative_status !== 'current') throw new Error('Нужна повторная нормативная проверка с явным сроком следующей сверки. Сохраните проверенный пакет новой редакцией перед выпуском.');
        const result = await publishRtnModule(keyId, effective, note);
        return `Учебная редакция выпущена: ${result.release_id}. Старые попытки сохраняют прежнюю редакцию.`;
      }
      if (!selection) throw new Error('Выберите редакцию исходного документа.');
      const payload = parsePackage(text);
      if (mode === 'normalize' || mode === 'correct') {
        const source = query.data?.source_revisions.find(item => item.id === selection);
        if (!source) throw new Error('Обновите список исходных редакций.');
        const banks = Array.isArray(payload) ? [{ code: 'A.1', questions: payload }] : payload.normalized_banks;
        if (!Array.isArray(banks) || !banks.length) throw new Error('Нужен массив формулировок А.1 или normalized_banks.');
        const body: Record<string, unknown> = { operation: 'normalize', sourceRevisionId: source.id, normalizedBanks: banks };
        if (mode === 'correct') {
          if (correctionNote.trim().length < 10) throw new Error('Укажите основание исправления формулировок.');
          const previous: Record<string, string> = {};
          for (const item of banks) {
            const bank = query.data?.banks.find(b => b.code === item.code && b.source_id === source.source_id && !b.parent_bank_id);
            const latest = query.data?.bank_revisions.filter(r => r.bank_id === bank?.id && r.source_revision_id === source.id)
              .sort((a, b) => (b.normalization_version || 1) - (a.normalization_version || 1) || b.created_at.localeCompare(a.created_at))[0];
            if (!latest) throw new Error('Не найдена предыдущая редакция. Обновите данные.');
            previous[item.code] = latest.id;
          }
          body.previousRevisionIds = previous; body.correctionNote = correctionNote;
        }
        await rtnEditorialWorker(body);
        return 'Формулировки сохранены отдельной неизменяемой редакцией. Ответы ещё не утверждены.';
      }
      const revision = query.data?.bank_revisions.find(item => item.id === selection);
      if (!revision) throw new Error('Обновите список редакций вопросов.');
      const result = await reviewRtnModule(revision.bank_id, revision.id, payload);
      setKeyId(result.key_set_id);
      return 'Материалы и учебные ответы сохранены после проверки. Перед выпуском задайте дату применения.';
    },
    onSuccess: async (message, action) => {
      if (action === 'publish') { setKeyId(''); setEffective(''); setNote(''); }
      if (action === 'rollout') setRolloutRequest(null);
      setNotice(message); await refresh();
    },
  });
  const data = query.data;
  const busy = mutation.isPending || query.isFetching || npaInteractionLocked;
  return <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <Button variant="ghost" aria-expanded={open} disabled={npaInteractionLocked} onClick={() => setOpen(v => !v)}>Редакции и предметная проверка · администратор</Button>
    {open && <div className="mt-4 min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">Оригинал, извлечённые формулировки, проверенные учебные ответы и выпуск сохраняются отдельно. Непроверенные ключи не включаются в обучение. Клиентские курсы не изменяются.</p>
      {query.isPending && <p role="status">Загружаем редакции…</p>}
      {query.error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{errorText(query.error)}</p><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>Повторить загрузку редакций</Button></div>}
      {data && !query.error && <>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => mutation.mutate('bootstrap')}>Проверить подключение источников</Button><Button variant="ghost" disabled={busy} onClick={async () => { const result = await query.refetch(); if (!result.error) setRolloutRequest(null); }}>Обновить данные</Button></div>
        {data.rollout && <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Этап запуска Ростехнадзора">
          <h3 className="text-sm font-semibold">{data.rollout.stage === 'paid' ? 'Включено в действующий доступ организаций' : 'Пилот: Техносервис и технические QA-организации'}</h3>
          <p className="text-xs text-muted-foreground">Учёт месячных лимитов: {data.rollout.quota_integration_ready ? 'подключён' : 'проходит проверку'}. Обработка удаления персональных данных: {data.rollout.privacy_integration_ready ? 'подключена' : 'проходит проверку'}.</p>
          {data.rollout.stage === 'pilot' && <>
            <label className="block space-y-1 text-sm">Подтверждение проверки QA<input className={field} value={qaReceipt} disabled={busy || !!rolloutRequest} onChange={event => setQaReceipt(event.target.value)} /></label>
            <label className="block space-y-1 text-sm">Подтверждение проверки Техносервиса<input className={field} value={techReceipt} disabled={busy || !!rolloutRequest} onChange={event => setTechReceipt(event.target.value)} /></label>
            <label className="block space-y-1 text-sm">Основание включения<input className={field} value={rolloutReason} disabled={busy || !!rolloutRequest} onChange={event => setRolloutReason(event.target.value)} /></label>
            <Button disabled={busy || !data.rollout.quota_integration_ready || !data.rollout.privacy_integration_ready || !qaReceipt.trim() || !techReceipt.trim() || rolloutReason.trim().length < 10} onClick={() => mutation.mutate('rollout')}>Включить для организаций с действующим доступом</Button>
          </>}
        </section>}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">Этап<select className={field} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setSelection(''); setNotice(''); }}><option value="normalize">Сохранить формулировки из оригинала</option><option value="correct">Исправить извлечение из оригинала</option><option value="review">Утвердить материалы и учебные ответы</option></select></label>
          <label className="min-w-0 space-y-1 text-sm">Исходная редакция<select className={field} value={selection} onChange={event => setSelection(event.target.value)}><option value="">Выберите редакцию</option>
            {mode !== 'review' ? data.source_revisions.filter(item => mode === 'correct' ? !item.normalization_required : item.normalization_required).map(item => <option key={item.id} value={item.id}>{data.sources.find(s => s.id === item.source_id)?.title} · {item.sha256.slice(0, 12)}</option>)
              : data.bank_revisions.filter(item => data.banks.some(bank => bank.id === item.bank_id && !bank.parent_bank_id)).map(item => <option key={item.id} value={item.id}>{data.banks.find(b => b.id === item.bank_id)?.title} · {item.question_count} вопросов · извлечение {item.normalization_version ?? 1} · {item.created_at.slice(0, 10)} · {item.id.slice(0, 8)}</option>)}
          </select></label>
        </div>
        {mode === 'correct' && <label className="block space-y-1 text-sm">Основание исправления<input className={field} value={correctionNote} onChange={event => setCorrectionNote(event.target.value)} /><span className="block text-xs text-muted-foreground">Создаётся новая редакция извлечения. Старые формулировки, выпуски и результаты сохраняются.</span></label>}
        <label className="block min-w-0 space-y-1 text-sm">Файл проверенного пакета<input type="file" accept=".json,application/json" className={field} disabled={busy} onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setPackageError('');
          if (file.size > 2_000_000) { setPackageError('Пакет должен быть не больше 2 МБ.'); return; }
          try { const content = await file.text(); parsePackage(content); setText(content); }
          catch { setPackageError('Не удалось прочитать JSON-пакет.'); }
        }} /></label>
        {packageError && <p role="alert" className="text-sm text-destructive">{packageError}</p>}
        <label className="block min-w-0 space-y-1 text-sm">Проверенный пакет JSON<textarea aria-label="Проверенный пакет JSON" className={`${field} min-h-36 font-mono text-xs`} value={text} onChange={event => { setText(event.target.value); setPackageError(''); }} /></label>
        <Button disabled={busy || !selection || !text.trim() || (mode === 'correct' && correctionNote.trim().length < 10)} onClick={() => mutation.mutate('save')}>{mode === 'review' ? 'Подтвердить предметную проверку' : 'Сохранить формулировки'}</Button>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="min-w-0 space-y-1 text-sm">Проверенный набор<select className={field} value={keyId} onChange={event => setKeyId(event.target.value)}><option value="">Выберите набор</option>{data.key_sets.filter(item => !data.releases.some(r => r.key_set_id === item.id)).map(item => <option key={item.id} value={item.id}>{data.banks.find(b => b.id === item.bank_id)?.title} · {item.question_count} вопросов, {item.material_count} разделов · {item.normative_status === "current" ? `повторная сверка до ${item.editorial_review_before || item.normative_cutoff_at || "уточняется"}` : "нужна нормативная проверка"}</option>)}</select></label>
          <label className="space-y-1 text-sm">Применять с<input type="date" className={field} value={effective} onChange={event => setEffective(event.target.value)} /></label>
        </div>
        <label className="block space-y-1 text-sm">Основание выпуска<input className={field} value={note} onChange={event => setNote(event.target.value)} /></label>
        <Button disabled={busy || !keyId || !effective || note.trim().length < 10} onClick={() => mutation.mutate('publish')}>Выпустить проверенную учебную редакцию</Button>
      </>}
      <RtnNormativeEditorialPanel organizationId={organizationId} onInteractionLockChange={setNpaInteractionLocked} />
      {mutation.error && <p role="alert" className="break-words text-sm text-destructive">{errorText(mutation.error)}</p>}
      {notice && <p role="status" className="break-words text-sm">{notice}</p>}
      {(mutation.isPending || query.isFetching) && <p role="status" className="text-sm text-muted-foreground">Сохраняем. Дождитесь результата запроса…</p>}
    </div>}
  </section>;
}
