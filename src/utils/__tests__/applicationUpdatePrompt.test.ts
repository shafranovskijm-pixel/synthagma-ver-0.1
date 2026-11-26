import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationUpdates, createApplicationUpdateCoordinator, presentApplicationRecoveryUpdates, registerApplicationWorker } from '../applicationUpdatePrompt';

const browser = vi.hoisted(() => ({
  events: new Map<string, (event: any) => void>(),
  register: vi.fn(), skip: vi.fn(), notice: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => browser.notice(...args) }));
vi.mock('workbox-window', () => ({ Workbox: class {
  addEventListener(name: string, listener: (event: any) => void) { browser.events.set(name, listener); }
  register = browser.register;
  messageSkipWaiting = browser.skip;
} }));

function fixture() {
  let waiting: object | null = null;
  let active: object | null = {};
  const reload = vi.fn(); const skip = vi.fn();
  const notices: Array<{ failed: boolean; update: () => void }> = [];
  const coordinator = createApplicationUpdateCoordinator({
    waiting: () => waiting, active: () => active, reload, skipWaiting: skip,
    notice: value => notices.push(value),
    later: (callback, delay) => setTimeout(callback, delay),
    cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  });
  return { coordinator, reload, skip, notices,
    setWaiting(value: object | null) { waiting = value; }, setActive(value: object | null) { active = value; } };
}

describe('an update requires a local explicit action', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('queues detection until startup is ready without activating or reloading', () => {
    const f = fixture(); const worker = {}; f.setWaiting(worker);
    f.coordinator.available(worker);
    expect(f.notices).toHaveLength(0);
    f.coordinator.markReady();
    expect(f.notices).toHaveLength(1);
    expect(f.skip).not.toHaveBeenCalled(); expect(f.reload).not.toHaveBeenCalled();
  });
  it('external waiting, activated and controlling events leave another tab alone', () => {
    const a = fixture(); const b = fixture(); const worker = {};
    a.coordinator.markReady(); b.coordinator.markReady();
    a.setWaiting(worker); b.setWaiting(worker);
    a.coordinator.available(worker); b.coordinator.available(worker);
    a.notices.at(-1)!.update();
    expect(a.skip).toHaveBeenCalledExactlyOnceWith(worker);
    a.setActive(worker); b.setActive(worker);
    a.coordinator.activated(worker); b.coordinator.activated(worker);
    a.coordinator.activated(worker); b.coordinator.activated(worker);
    expect(a.reload).toHaveBeenCalledTimes(1);
    expect(b.reload).not.toHaveBeenCalled(); expect(b.skip).not.toHaveBeenCalled();
  });
  it('rejects a stale toast instead of activating a replacement waiting worker', () => {
    const f = fixture(); const first = {}; const replacement = {};
    f.coordinator.markReady(); f.setWaiting(first); f.coordinator.available(first);
    const stale = f.notices.at(-1)!.update;
    f.setWaiting(replacement); stale();
    expect(f.skip).not.toHaveBeenCalled(); expect(f.reload).not.toHaveBeenCalled();
    f.notices.at(-1)!.update();
    expect(f.skip).toHaveBeenCalledExactlyOnceWith(replacement);
  });
  it('never lets an accepted worker authorize a different external worker', () => {
    const f = fixture(); const own = {}; const external = {};
    f.coordinator.markReady(); f.setWaiting(own); f.coordinator.available(own);
    f.notices.at(-1)!.update();
    f.setActive(external); f.coordinator.activated(external);
    f.setActive(own); f.coordinator.activated(own);
    expect(f.reload).not.toHaveBeenCalled();
  });
  it('requires actual active identity, not just a matching event value', () => {
    const f = fixture(); const own = {};
    f.coordinator.markReady(); f.setWaiting(own); f.coordinator.available(own); f.notices.at(-1)!.update();
    f.coordinator.activated(own);
    expect(f.reload).not.toHaveBeenCalled();
    f.setActive(own); f.coordinator.activated(own);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('expires the click after a failed activation; a late event cannot reload', () => {
    const f = fixture(); const own = {};
    f.coordinator.markReady(); f.setWaiting(own); f.coordinator.available(own); f.notices.at(-1)!.update();
    vi.advanceTimersByTime(20000);
    expect(f.notices.at(-1)!.failed).toBe(true);
    f.setActive(own); f.coordinator.activated(own);
    expect(f.reload).not.toHaveBeenCalled();
  });
  it('reports a synchronous skip failure without a fallback reload', () => {
    const f = fixture(); const own = {}; f.skip.mockImplementation(() => { throw new Error('offline'); });
    f.coordinator.markReady(); f.setWaiting(own); f.coordinator.available(own); f.notices.at(-1)!.update();
    expect(f.notices.at(-1)!.failed).toBe(true);
    expect(f.reload).not.toHaveBeenCalled();
  });
  it('revokes a redundant worker and keeps late events advisory', () => {
    const f = fixture(); const own = {};
    f.coordinator.markReady(); f.setWaiting(own); f.coordinator.available(own); f.notices.at(-1)!.update();
    f.setWaiting(null); f.coordinator.redundant(own); f.setActive(own); f.coordinator.activated(own);
    expect(f.reload).not.toHaveBeenCalled();
  });
  it('does not reload for a build/asset hint until clicked, and then only once', () => {
    const f = fixture(); f.coordinator.markReady(); f.coordinator.available();
    vi.advanceTimersByTime(60000); expect(f.reload).not.toHaveBeenCalled();
    f.notices[0].update(); f.notices[0].update();
    expect(f.reload).toHaveBeenCalledTimes(1); expect(f.skip).not.toHaveBeenCalled();
  });
  it('allows a later local click for the exact already active advertised worker', () => {
    const f = fixture(); const own = {}; f.setActive(own); f.coordinator.markReady(); f.coordinator.activated(own);
    expect(f.reload).not.toHaveBeenCalled(); f.notices.at(-1)!.update(); expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('the production adapter wires Workbox events without built-in reload listeners', async () => {
    const worker = {} as ServiceWorker;
    const registration = { waiting: worker, active: null, update: vi.fn(async () => {}) };
    browser.register.mockResolvedValue(registration);
    vi.stubGlobal('navigator', { serviceWorker: {} });
    await registerApplicationWorker(); applicationUpdates.markReady();
    await registerApplicationWorker();
    expect(browser.register).toHaveBeenCalledTimes(1);
    expect(browser.events.has('waiting')).toBe(true);
    browser.events.get('waiting')!({ sw: worker, isUpdate: true });
    browser.events.get('activated')!({ sw: worker, isExternal: true });
    browser.events.get('controlling')!({ sw: worker, isExternal: true });
    expect(browser.skip).not.toHaveBeenCalled();
    expect(browser.notice).toHaveBeenCalledWith('Доступна новая версия', expect.objectContaining({ duration: Infinity, action: expect.objectContaining({ label: 'Обновить' }) }));
    const recovery = vi.fn(); const stop = presentApplicationRecoveryUpdates(recovery);
    expect(recovery).toHaveBeenCalledWith(expect.objectContaining({ update: expect.any(Function) }));
    expect(browser.skip).not.toHaveBeenCalled();
    const oldNoticeCount = browser.notice.mock.calls.length;
    browser.events.get('waiting')!({ sw: worker, isUpdate: true });
    expect(browser.notice).toHaveBeenCalledTimes(oldNoticeCount);
    stop(); browser.events.get('waiting')!({ sw: worker, isUpdate: true });
    expect(browser.notice).toHaveBeenCalledTimes(oldNoticeCount + 1);
    vi.unstubAllGlobals();
  });
});
