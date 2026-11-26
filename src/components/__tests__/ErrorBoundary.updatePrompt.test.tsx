import React, { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { createApplicationUpdateCoordinator } from '@/utils/applicationUpdatePrompt';

const recovery = vi.hoisted(() => ({
  listeners: new Set<(notice: any) => void>(), available: vi.fn(), stopped: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock('@/utils/applicationUpdatePrompt', async importOriginal => {
  const original = await importOriginal<typeof import('@/utils/applicationUpdatePrompt')>();
  return { ...original, applicationUpdates: { available: (...args: unknown[]) => recovery.available(...args) },
    presentApplicationRecoveryUpdates: (listener: (notice: any) => void) => {
      recovery.listeners.add(listener); recovery.available();
      return () => { recovery.listeners.delete(listener); recovery.stopped(); };
    } };
});

afterEach(() => { cleanup(); recovery.listeners.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('manual recovery survives the outer ErrorBoundary unmounting Sonner', () => {
  it('keeps the existing button bound to the current worker after a real second lazy failure', async () => {
    vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {});
    let waiting: object | null = {}; let active: object | null = {};
    const first = waiting; const replacement = {}; const skip = vi.fn(); const reload = vi.fn();
    const coordinator = createApplicationUpdateCoordinator({
      waiting: () => waiting, active: () => active, skipWaiting: skip, reload,
      notice: value => { for (const listener of recovery.listeners) listener(value); },
      later: (callback, ms) => setTimeout(callback, ms), cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
    });
    coordinator.markReady(); recovery.available.mockImplementation(() => coordinator.available());
    let toasterMounted = true;
    function ToasterLifetime() { React.useEffect(() => () => { toasterMounted = false; }, []); return null; }
    const failedImport = vi.fn().mockRejectedValue(new Error('TEST old chunk unavailable'));
    const Failed = lazyWithRetry(failedImport);
    const view = render(<ErrorBoundary><ToasterLifetime /><Suspense fallback={<p>TEST loading</p>}><Failed /></Suspense></ErrorBoundary>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(failedImport).toHaveBeenCalledTimes(2);
    expect(toasterMounted).toBe(false);
    expect(screen.getByText('Произошла ошибка')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Перезагрузить' });
    expect(button).toHaveProperty('disabled', false);
    expect(skip).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    waiting = replacement;
    fireEvent.click(button); // stale first-worker action can only refresh the visible choice
    expect(skip).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(skip).toHaveBeenCalledExactlyOnceWith(replacement);
    expect(skip.mock.calls[0][0]).toBe(replacement);
    expect(skip.mock.calls[0][0]).not.toBe(first);
    active = replacement;
    act(() => coordinator.activated(replacement));
    expect(reload).toHaveBeenCalledTimes(1);
    view.unmount(); expect(recovery.listeners.size).toBe(0);
  });
  it('unsubscribes on the existing try-again action without activating a worker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = vi.fn(); recovery.available.mockImplementation(() => {
      for (const listener of recovery.listeners) listener({ failed: false, update });
    });
    let broken = true;
    function Content() { if (broken) throw new Error('TEST recoverable render error'); return <p>TEST recovered</p>; }
    render(<ErrorBoundary><Content /></ErrorBoundary>);
    expect(recovery.listeners.size).toBe(1);
    broken = false; fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(screen.getByText('TEST recovered')).toBeTruthy();
    expect(recovery.listeners.size).toBe(0); expect(update).not.toHaveBeenCalled();
  });
});
