import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RtnApiError } from '@/api/rostechnadzor';
import type { RtnNewsCheckState, RtnNewsRunReceipt } from '@/types/rtn-news-check';
import { RtnNewsSourceCheck } from './RtnNewsSourceCheck';
const api = vi.hoisted(() => ({ getRtnNewsCheckState: vi.fn(), checkRtnNewsNow: vi.fn() }));
vi.mock('@/api/rtn-news-check', () => api);
const org = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const actor = '81000000-0000-4000-8000-000000000001', second = '81000000-0000-4000-8000-000000000002';
const now = '2026-11-20T12:00:00Z', run = '90000000-0000-4000-8000-000000000001';
const receipt = (status: RtnNewsRunReceipt['status'] = 'running'): RtnNewsRunReceipt => ({ run_id: run, status, queued_at: now,
  completed_at: status === 'running' || status === 'queued' ? null : now, new_event_count: status === 'changed' ? 1 : 0, correction_count: 0, unchanged_count: 0,
  error_code: status === 'error' ? 'RTN_NEWS_HTTP_403' : null, replayed: false, last_success_at: null, cooldown_until: null });
const state = (): RtnNewsCheckState => ({ check: null, can_request: true, next_due_at: now, source_health: { code: 'official-news-rss', feed_url: 'https://www.gosnadzor.ru/news/rss/',
  status: 'never_checked', coverage_kind: 'unknown', last_checked_at: null, last_success_at: null, coverage_from: null, coverage_until: null, error_code: null, complete_archive: false } });
const props = () => ({ organizationId: org, actorId: actor, canReadCourses: true, canManageCourses: true });
const flush = () => act(async () => undefined);
const click = async (name = 'Проверить новости сейчас') => { fireEvent.click(screen.getByRole('button', { name }));await flush(); };
beforeEach(() => {
  vi.useFakeTimers();vi.setSystemTime(new Date(now));vi.resetAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  api.getRtnNewsCheckState.mockResolvedValue(state());api.checkRtnNewsNow.mockResolvedValue(receipt('changed'));
});
afterEach(() => { cleanup();vi.useRealTimers();Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
describe('official news source controls', () => {
  it('renders source controls for a preexisting PostgreSQL UUID session actor without changing the organization selector', async () => {
    render(<RtnNewsSourceCheck {...props()} actorId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />);await flush();
    expect(screen.getByRole('region', { name: 'Новости официального сайта' })).toBeInTheDocument();
    expect(api.getRtnNewsCheckState).toHaveBeenCalledWith(org, expect.any(AbortSignal));
    expect(api.checkRtnNewsNow).not.toHaveBeenCalled();
  });
  it('requires a real actor organization and course read permission before mounting or reading', async () => {
    const view = render(<RtnNewsSourceCheck {...props()} canReadCourses={false} />);
    view.rerender(<RtnNewsSourceCheck {...props()} actorId={null} />);view.rerender(<RtnNewsSourceCheck {...props()} organizationId="invalid" />);
    await flush();expect(api.getRtnNewsCheckState).not.toHaveBeenCalled();expect(api.checkRtnNewsNow).not.toHaveBeenCalled();expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
  it('loads status once without triggering a news check or background polling on open', async () => {
    api.getRtnNewsCheckState.mockResolvedValue({ ...state(), check: receipt('running') });render(<RtnNewsSourceCheck {...props()} />);await flush();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(1);expect(api.checkRtnNewsNow).not.toHaveBeenCalled();expect(screen.queryByText('Общая проверка новостей в очереди.', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Проверяем доступную RSS-ленту…')).toBeInTheDocument();
  });
  it('shows unknown coverage without claiming that there are no new publications', async () => {
    render(<RtnNewsSourceCheck {...props()} />);await flush();expect(screen.getByText('Успешная проверка ещё не подтверждена.')).toBeInTheDocument();
    expect(screen.getByText('Охват публикаций пока не подтверждён.')).toBeInTheDocument();expect(screen.queryByText(/новых версий записей не обнаружено/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toHaveClass('min-h-11');
  });
  it('requires both local management permission and the current server can_request flag', async () => {
    const view = render(<RtnNewsSourceCheck {...props()} canManageCourses={false} />);await flush();expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();
    api.getRtnNewsCheckState.mockResolvedValue({ ...state(), can_request: false });view.rerender(<RtnNewsSourceCheck {...props()} />);await flush();
    expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();expect(screen.getByText(/нужны права управления курсами/)).toBeInTheDocument();expect(api.checkRtnNewsNow).not.toHaveBeenCalled();
  });
  it('shows preserved last success and finite RSS window after blocking and respects the24h retry', async () => {
    const value: RtnNewsCheckState = { ...state(), check: { ...receipt('error'), cooldown_until: '2026-11-20T12:10:00Z' }, next_due_at: '2026-11-21T12:00:00Z', source_health: {
      ...state().source_health, status: 'blocked', last_checked_at: now, last_success_at: '2026-11-20T11:00:00Z', coverage_kind: 'finite_rss_window', coverage_from: '2026-11-20T08:00:00Z', coverage_until: '2026-11-20T09:00:00Z', error_code: 'RTN_NEWS_HTTP_403' } };
    api.getRtnNewsCheckState.mockResolvedValue(value);render(<RtnNewsSourceCheck {...props()} />);await flush();
    expect(screen.getByText(/Последняя успешная проверка: 20.11.2026, 14:00/)).toBeInTheDocument();expect(screen.getByText('RSS содержит только часть публикаций. Полный архив не проверен.')).toBeInTheDocument();
    expect(screen.getByText(/не раньше: 21.11.2026, 15:00/)).toBeInTheDocument();expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(600_001));expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();
    expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(1);expect(api.checkRtnNewsNow).not.toHaveBeenCalled();
  });
  it('enables after a known shared cooldown with one clock wake and no automatic network request', async () => {
    api.getRtnNewsCheckState.mockResolvedValue({ ...state(), check: { ...receipt('unchanged'), cooldown_until: '2026-11-20T12:10:00Z' } });render(<RtnNewsSourceCheck {...props()} />);await flush();
    expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();await act(async () => vi.advanceTimersByTimeAsync(600_030));
    expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeEnabled();expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(1);expect(api.checkRtnNewsNow).not.toHaveBeenCalled();
  });
  it('starts once on a double click, then reads status without another source request', async () => {
    let finish!: (value: RtnNewsRunReceipt) => void;api.checkRtnNewsNow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<RtnNewsSourceCheck {...props()} />);await flush();const button = screen.getByRole('button', { name: 'Проверить новости сейчас' });fireEvent.click(button);fireEvent.click(button);
    expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);expect(api.checkRtnNewsNow).toHaveBeenCalledWith(org, expect.any(AbortSignal));
    await act(async () => finish(receipt('changed')));expect(screen.getByText('Проверка RSS-ленты завершена.')).toBeInTheDocument();expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);
  });
  it('polls only its returned pending run every5s and stops at a confirmed terminal state', async () => {
    api.checkRtnNewsNow.mockResolvedValue({ run_id: run, status: 'queued' });api.getRtnNewsCheckState.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), check: receipt() }).mockResolvedValue({ ...state(), check: receipt('changed') });
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(4999));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(3);expect(screen.getByText('Проверка RSS-ленты завершена.')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(3);expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);
  });
  it('pauses all polling reads while hidden and resumes bounded status only when visible', async () => {
    api.checkRtnNewsNow.mockResolvedValue({ run_id: run, status: 'queued' });api.getRtnNewsCheckState.mockResolvedValue({ ...state(), check: receipt() });
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });fireEvent(document, new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });fireEvent(document, new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTimeAsync(5000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(3);expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);
  });
  it('never overlaps slow status reads even when visibility events repeat', async () => {
    let finish!: (value: RtnNewsCheckState) => void;api.checkRtnNewsNow.mockResolvedValue({ run_id: run, status: 'queued' });
    api.getRtnNewsCheckState.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), check: receipt() }).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();await act(async () => vi.advanceTimersByTimeAsync(5000));
    fireEvent(document, new Event('visibilitychange'));await act(async () => vi.advanceTimersByTimeAsync(10_000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(3);
    await act(async () => finish({ ...state(), check: receipt('changed') }));expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);
  });
  it('stops unconfirmed after120s with a bounded number of status reads', async () => {
    api.checkRtnNewsNow.mockResolvedValue({ run_id: run, status: 'queued' });api.getRtnNewsCheckState.mockResolvedValue({ ...state(), check: receipt() });
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();await act(async () => vi.advanceTimersByTimeAsync(120_001));
    expect(api.getRtnNewsCheckState.mock.calls.length).toBeLessThanOrEqual(26);expect(screen.getByText(/Результат ручного запуска пока не подтверждён полностью/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();
    const calls = api.getRtnNewsCheckState.mock.calls.length;await act(async () => vi.advanceTimersByTimeAsync(60_000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(calls);expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);
  });
  it('does not follow a different global run as though it were the manual result', async () => {
    api.checkRtnNewsNow.mockResolvedValue({ run_id: run, status: 'queued' });api.getRtnNewsCheckState.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), check: receipt() }).mockResolvedValue({ ...state(), check: { ...receipt(), run_id: org } });
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText(/Результат ручного запуска пока не подтверждён полностью/)).toBeInTheDocument();await act(async () => vi.advanceTimersByTimeAsync(30_000));expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(3);
  });
  it('shows a failed check explicitly and never claims unchanged or complete archive', async () => {
    api.checkRtnNewsNow.mockResolvedValue(receipt('error'));api.getRtnNewsCheckState.mockResolvedValue({ ...state(), check: receipt('error') });
    render(<RtnNewsSourceCheck {...props()} />);await flush();await click();expect(screen.getByText('Проверка не выполнена. Наличие новых публикаций не подтверждено.')).toBeInTheDocument();
    expect(screen.queryByText(/новых версий записей не обнаружено/)).not.toBeInTheDocument();expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);
  });
  it('requires a read-only status refresh after an unknown manual outcome instead of auto-retrying', async () => {
    api.checkRtnNewsNow.mockRejectedValue(new RtnApiError('network', 'Результат не подтверждён.'));render(<RtnNewsSourceCheck {...props()} />);await flush();await click();
    expect(screen.getByRole('alert')).toHaveTextContent('Результат не подтверждён.');expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();
    await click('Обновить состояние');expect(api.checkRtnNewsNow).toHaveBeenCalledTimes(1);expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not present a denied status as zero news or leave a manual action enabled', async () => {
    api.getRtnNewsCheckState.mockRejectedValue(new RtnApiError('forbidden', 'Нет доступа.'));render(<RtnNewsSourceCheck {...props()} />);await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Нет доступа.');expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();expect(screen.queryByText(/новых версий/)).not.toBeInTheDocument();
  });
  it('ignores old manual completion after actor or organization scope changes', async () => {
    let finish!: (value: RtnNewsRunReceipt) => void;api.checkRtnNewsNow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<RtnNewsSourceCheck {...props()} />);await flush();await click();view.rerender(<RtnNewsSourceCheck {...props()} actorId={second} organizationId={other} />);await flush();
    await act(async () => finish(receipt('changed')));expect(screen.queryByText('Проверка RSS-ленты завершена.')).not.toBeInTheDocument();expect(api.getRtnNewsCheckState).toHaveBeenCalledTimes(2);
    expect(api.getRtnNewsCheckState).toHaveBeenLastCalledWith(other, expect.any(AbortSignal));
  });
  it('immediately cancels the previous view when management permission is revoked', async () => {
    let finish!: (value: RtnNewsRunReceipt) => void;api.checkRtnNewsNow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<RtnNewsSourceCheck {...props()} />);await flush();await click();view.rerender(<RtnNewsSourceCheck {...props()} canManageCourses={false} />);await flush();
    await act(async () => finish(receipt('changed')));expect(screen.getByRole('button', { name: 'Проверить новости сейчас' })).toBeDisabled();expect(screen.queryByText('Проверка RSS-ленты завершена.')).not.toBeInTheDocument();
  });
  it('does not let a StrictMode pre-cleanup response replace the current status', async () => {
    let finish!: (value: RtnNewsCheckState) => void;api.getRtnNewsCheckState.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(state());
    render(<StrictMode><RtnNewsSourceCheck {...props()} /></StrictMode>);await flush();
    await act(async () => finish({ ...state(), source_health: { ...state().source_health, status: 'blocked', last_checked_at: now, error_code: 'RTN_NEWS_HTTP_403' } }));
    expect(screen.getByText('Успешная проверка ещё не подтверждена.')).toBeInTheDocument();expect(screen.queryByText(/Официальный источник недоступен/)).not.toBeInTheDocument();
  });
});
