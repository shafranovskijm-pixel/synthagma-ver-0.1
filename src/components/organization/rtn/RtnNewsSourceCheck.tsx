import { useCallback, useEffect, useRef, useState } from 'react';
import { checkRtnNewsNow, getRtnNewsCheckState } from '@/api/rtn-news-check';
import { RtnApiError } from '@/api/rostechnadzor';
import { Button } from '@/components/ui/button';
import type { RtnNewsCheckState, RtnNewsManualReceipt } from '@/types/rtn-news-check';
import { rtnUpdateBox } from './RtnUpdatePresentation';

interface Props {
  organizationId: string | null;
  actorId: string | null;
  canReadCourses: boolean;
  canManageCourses: boolean;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Existing authenticated subjects include PostgreSQL UUIDs predating the
// RFC-version convention. Actor identity still comes only from the session.
const ACTOR_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const pending = (value: RtnNewsManualReceipt | null | undefined) => value?.status === 'queued' || value?.status === 'running';
function date(value: string | null): string {
  return value ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(value)) : 'Не подтверждено';
}
const message = (error: unknown) => error instanceof RtnApiError ? error.message : 'Не удалось подтвердить состояние новостей. Обновите сведения.';
function RunStatus({ run }: { run: RtnNewsManualReceipt }) {
  return <div role="status" aria-live="polite" className="space-y-1 text-sm">
    <p>{run.status === 'queued' ? 'Общая проверка новостей в очереди.' : run.status === 'running' ? 'Проверяем доступную RSS-ленту…' : run.status === 'error' ? 'Проверка не выполнена. Наличие новых публикаций не подтверждено.' : run.status === 'unchanged' ? 'В полученной RSS-ленте новых версий записей не обнаружено.' : 'Проверка RSS-ленты завершена.'}</p>
    {'new_event_count' in run && run.status === 'changed' && <p className="text-xs text-muted-foreground">Сохранено записей: {run.new_event_count}; исправлений: {run.correction_count}. Это не количество личных уведомлений.</p>}
    {'replayed' in run && run.replayed && <p className="text-xs text-muted-foreground">Показан уже имеющийся результат общей проверки.</p>}
  </div>;
}
function NewsCheck({ organizationId, canManageCourses }: { organizationId: string; canManageCourses: boolean }) {
  const [data, setData] = useState<RtnNewsCheckState | null>(null), [loading, setLoading] = useState(true), [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<unknown>(null), [lastManual, setLastManual] = useState<RtnNewsManualReceipt | null>(null), [unconfirmed, setUnconfirmed] = useState(false);
  const [monitor, setMonitor] = useState<{ id: string; deadline: number } | null>(null), [, updateClock] = useState(0);
  const alive = useRef(false), readSerial = useRef(0), busy = useRef(false);
  const statusAbort = useRef<AbortController | null>(null), manualAbort = useRef<AbortController | null>(null);
  const readStatus = useCallback(async (showLoading = false) => {
    const serial = ++readSerial.current;statusAbort.current?.abort();
    const controller = new AbortController();statusAbort.current = controller;
    const deadline = setTimeout(() => controller.abort(), 15_000);
    if (showLoading) setLoading(true);
    try {
      const value = await getRtnNewsCheckState(organizationId, controller.signal);
      if (alive.current && serial === readSerial.current) { setData(value);setError(null); }
      return value;
    } catch (e) {
      if (alive.current && serial === readSerial.current) { setError(e);if (e instanceof RtnApiError && e.code === 'forbidden') setData(null); }
      throw e;
    } finally { clearTimeout(deadline);if (alive.current && serial === readSerial.current) setLoading(false); }
  }, [organizationId]);
  useEffect(() => {
    alive.current = true;void readStatus(true).catch(() => undefined);
    return () => { alive.current = false;readSerial.current++;statusAbort.current?.abort();manualAbort.current?.abort(); };
  }, [readStatus]);
  // Status only, never another check. Opening a tab does not start this monitor.
  // Hidden pages issue no reads; at most24 reads/120s follow one explicit click.
  useEffect(() => {
    if (!monitor) return;
    let cancelled = false, inFlight = false, reads = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const finishUnknown = () => { if (!cancelled) { setMonitor(null);setUnconfirmed(true); } };
    const schedule = () => {
      clearTimeout(timer);
      if (cancelled || inFlight) return;
      if (Date.now() >= monitor.deadline || reads >= 24) return finishUnknown();
      if (document.visibilityState === 'visible') timer = setTimeout(() => void poll(), Math.min(5000, monitor.deadline - Date.now()));
    };
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== 'visible') return schedule();
      if (Date.now() >= monitor.deadline || reads >= 24) return finishUnknown();
      reads++;inFlight = true;let again = false;
      try {
        const value = await readStatus();
        if (cancelled) return;
        if (!value.check || value.check.run_id !== monitor.id) { setLastManual(null);return finishUnknown(); }
        setLastManual(value.check);
        if (!pending(value.check)) { setMonitor(null);return; }
        again = true;
      } catch { if (!cancelled) { setMonitor(null);setUnconfirmed(true); } }
      finally { inFlight = false;if (again && !cancelled) schedule(); }
    };
    const visibility = () => schedule();
    document.addEventListener('visibilitychange', visibility);schedule();
    return () => { cancelled = true;clearTimeout(timer);document.removeEventListener('visibilitychange', visibility); };
  }, [monitor, readStatus]);
  const health = data?.source_health;
  const cooldown = data?.check?.cooldown_until ? Date.parse(data.check.cooldown_until) : 0;
  const notBefore = Math.max(cooldown, health?.status === 'blocked' && data ? Date.parse(data.next_due_at) : 0);
  useEffect(() => {
    if (notBefore <= Date.now()) return;
    // A single clock wake enables the button after a known deadline, no RPC.
    const timer = setTimeout(() => updateClock(value => value + 1), Math.min(notBefore - Date.now() + 25, 86_400_025));
    return () => clearTimeout(timer);
  }, [notBefore]);
  const manual = async () => {
    if (busy.current || !data || !canManageCourses || !data.can_request || error || unconfirmed || notBefore > Date.now()) return;
    busy.current = true;setRequesting(true);setMonitor(null);setLastManual(null);setUnconfirmed(false);
    const controller = new AbortController();manualAbort.current = controller;
    try {
      const result = await checkRtnNewsNow(organizationId, controller.signal);
      if (!alive.current) return;
      setLastManual(result);
      const current = await readStatus();
      if (!alive.current) return;
      if (pending(result)) {
        if (current.check?.run_id === result.run_id) {
          setLastManual(current.check);
          if (pending(current.check)) setMonitor({ id: result.run_id, deadline: Date.now() + 120_000 });
        } else { setLastManual(null);setUnconfirmed(true); }
      }
    } catch (e) { if (alive.current) { setError(e);setUnconfirmed(true);if (e instanceof RtnApiError && e.code === 'forbidden') setData(null); } }
    finally { if (alive.current) { busy.current = false;setRequesting(false); } }
  };
  const refreshStatus = () => {
    if (busy.current) return;
    setMonitor(null);setLastManual(null);setUnconfirmed(false);void readStatus(true).catch(() => undefined);
  };
  const run = lastManual ?? data?.check;
  return <section className={`${rtnUpdateBox} space-y-3`} aria-label="Новости официального сайта">
    <h3 className="font-semibold">Новости официального сайта</h3>
    <p className="text-sm text-muted-foreground">Проверяем общую RSS-ленту Ростехнадзора. Это отдельная проверка новостей; она не выпускает ответы и не меняет учебные попытки.</p>
    <a className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" href="https://www.gosnadzor.ru/news/" target="_blank" rel="noopener noreferrer">Открыть новости Ростехнадзора</a>
    {loading && <p role="status" className="text-sm text-muted-foreground">Загружаем состояние источника…</p>}
    {Boolean(error) && <p role="alert" className="break-words text-sm text-destructive">{message(error)}</p>}
    {run && <RunStatus run={run} />}
    {unconfirmed && <p role="status" className="text-sm text-muted-foreground">Результат ручного запуска пока не подтверждён полностью. Обновите состояние; повторно запускать проверку автоматически мы не будем.</p>}
    {health && <div className="min-w-0 space-y-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
      <p>{health.status === 'never_checked' ? 'Успешная проверка ещё не подтверждена.' : health.status === 'blocked' ? 'Официальный источник недоступен для проверки. Ранее полученные записи сохранены.' : health.status === 'error' ? 'Последняя проверка источника завершилась ошибкой. Это не подтверждает отсутствие новостей.' : 'Доступная RSS-лента проверена; полный архив не подтверждён.'}</p>
      <p>Последняя успешная проверка: {date(health.last_success_at)}{health.last_success_at ? ' (МСК)' : ''}.</p>
      {health.last_checked_at && <p>Последняя попытка: {date(health.last_checked_at)} (МСК).</p>}
      <p>{health.coverage_kind === 'finite_rss_window' ? 'RSS содержит только часть публикаций. Полный архив не проверен.' : health.coverage_kind === 'verified_archive_interval' ? 'Подтверждён только указанный интервал, не весь архив.' : 'Охват публикаций пока не подтверждён.'}</p>
      {health.coverage_from && health.coverage_until && <p>Публикации в полученной ленте: {date(health.coverage_from)} — {date(health.coverage_until)} (МСК).</p>}
      {health.status === 'blocked' && data && <p>Повторная проверка источника не раньше: {date(data.next_due_at)} (МСК).</p>}
      {notBefore > Date.now() && health.status !== 'blocked' && <p>Общая проверка уже запускалась. Повторный запуск доступен после {date(new Date(notBefore).toISOString())} (МСК).</p>}
    </div>}
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button className="h-auto min-h-11 whitespace-normal" disabled={loading || requesting || !data || !canManageCourses || !data.can_request || Boolean(error) || unconfirmed || notBefore > Date.now() || Boolean(monitor)} onClick={() => void manual()}>{requesting ? 'Проверяем новости…' : 'Проверить новости сейчас'}</Button>
      <Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={loading || requesting} onClick={refreshStatus}>Обновить состояние</Button>
    </div>
    {data && (!canManageCourses || !data.can_request) && <p className="text-xs text-muted-foreground">Для ручной проверки нужны права управления курсами. Состояние источника доступно для просмотра.</p>}
    {monitor && <p className="text-xs text-muted-foreground">Обновляем только состояние этой проверки, пока вкладка открыта. Проверка источника повторно не запускается.</p>}
  </section>;
}
export function RtnNewsSourceCheck({ organizationId, actorId, canReadCourses, canManageCourses }: Props) {
  if (!canReadCourses || !organizationId || !actorId || !UUID.test(organizationId) || !ACTOR_UUID.test(actorId)) return null;
  return <NewsCheck key={`${actorId}:${organizationId}:${canManageCourses}`} organizationId={organizationId} canManageCourses={canManageCourses} />;
}
