import React from 'react';
import { createHash } from 'node:crypto';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ORG_ID } from '@/constants/marketplace';
import { HomeworkTaskDescription, type HomeworkTaskScope } from '@/components/course-learning/HomeworkTaskDescription';
import { usePlatformHomeworkTaskProof } from '@/hooks/usePlatformHomeworkTaskProof';
import { observeOfflineAccess, setOfflineAuthActor } from '@/utils/courseCache';
import { ports } from './setup';

const courseId = '64ea14ee-6e9b-4e0d-a82d-d48ae2bf5599';
const lessonId = '10000000-0000-4000-8000-000000000001';
const actorId = '20000000-0000-4000-8000-000000000002';
const ownerId = '0e29e728-bcc5-46e6-a339-066fb1e9c726';
const policyId = '30000000-0000-4000-8000-000000000003';
const otherId = '40000000-0000-4000-8000-000000000004';
const html = '<h2>Проверяемая практика</h2>\r\n<p>Сравните е\u0308 и ё.</p><table><tbody><tr><td>Результат</td></tr></tbody></table>';
const scope: HomeworkTaskScope = { routeCourseId: courseId, course: { id: courseId, organization_id: ownerId }, lesson: { id: lessonId, course_id: courseId }, actorId };
const options = { scope, content: html, lessonType: 'homework', enabled: true, contextKey: 'synthetic-learning-context' };
const verified = (content = html, overrides: Record<string, unknown> = {}) => ({ status: 'verified', courseId, lessonId, contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'), policyId, ...overrides });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const settleRpc = async () => { await waitFor(() => expect(ports.completed).toBe(1)); await act(async () => { await Promise.resolve(); }); };

function View({ value = options }: { value?: typeof options }) {
  const result = usePlatformHomeworkTaskProof(value);
  return <HomeworkTaskDescription content={value.content} scope={result.scope} proof={result.proof} role="document" className="text-sm whitespace-pre-wrap" />;
}

beforeEach(() => {
  setOfflineAuthActor(null); setOfflineAuthActor(actorId);
  const user = { id: actorId, is_anonymous: false };
  ports.auth = { user, session: { user, access_token: 'synthetic-test-session' }, loading: false, authError: null };
  ports.rpc.mockResolvedValue({ data: verified(), error: null });
});

describe('Exact registered homework presentation — actual hook and renderer', () => {
  it('HP01 renders only after exact RPC IDs, policy UUID and raw UTF-8 hash match', async () => {
    const { container } = render(<View />);
    expect(container.querySelector('h2,table')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Проверяемая практика' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Результат' })).toBeTruthy();
    expect(ports.rpc).toHaveBeenCalledWith('get_platform_learning_task_proof', { p_course_id: courseId, p_lesson_id: lessonId }, expect.any(AbortSignal));
    expect(screen.getByRole('document').classList.contains('whitespace-normal')).toBe(true);
  });

  it('HP02 a normalized/trimmed/line-ending-changed digest does not match the original bytes', async () => {
    ports.rpc.mockResolvedValue({ data: verified(html.normalize('NFC').replace(/\r\n/g, '\n')), error: null });
    const { container } = render(<View />); await settleRpc();
    expect(container.querySelector('h2,table')).toBeNull(); expect(container.textContent).toBe(html);
  });

  it.each([
    ['unknown', { status: 'unknown' }], ['source_changed', { status: 'source_changed' }],
    ['wrong course', verified(html, { courseId: otherId })], ['wrong lesson', verified(html, { lessonId: otherId })],
    ['bad policy', verified(html, { policyId: 'not-a-uuid' })], ['missing digest', verified(html, { contentSha256: undefined })],
    ['array', [verified()]], ['null', null],
  ])('HP03 fails closed for %s', async (_name, data) => {
    ports.rpc.mockResolvedValue({ data, error: null });
    const { container } = render(<View />); await settleRpc();
    expect(container.querySelector('h2,table')).toBeNull(); expect(container.textContent).toBe(html);
  });

  it('HP04 missing deployed RPC, transport errors and crypto errors keep escaped text', async () => {
    ports.rpc.mockResolvedValue({ data: verified(), error: { message: 'Missing RPC' } });
    const { container, unmount } = render(<View />); await settleRpc();
    expect(container.querySelector('h2,table')).toBeNull(); unmount();
    ports.rpc.mockClear(); vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('Crypto unavailable')) } });
    const second = render(<View />); await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(ports.rpc).not.toHaveBeenCalled(); expect(second.container.textContent).toBe(html);
  });

  it('HP05 route, loaded lesson, owner, actor, disabled context and anonymous context cannot start proof', async () => {
    const variants = [
      { ...options, scope: { ...scope, routeCourseId: otherId } },
      { ...options, scope: { ...scope, lesson: { id: lessonId, course_id: otherId } } },
      { ...options, scope: { ...scope, course: { id: courseId } } },
      { ...options, scope: { ...scope, actorId: otherId } },
      { ...options, enabled: false }, { ...options, lessonType: 'text' },
    ];
    for (const value of variants) { const result = renderHook(() => usePlatformHomeworkTaskProof(value)); expect(result.result.current.proof).toBeNull(); result.unmount(); }
    ports.auth = { ...ports.auth, user: { id: actorId, is_anonymous: true } };
    const result = renderHook(() => usePlatformHomeworkTaskProof(options));
    await act(async () => { await Promise.resolve(); });
    expect(result.result.current.proof).toBeNull(); expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('HP06 source_course_id alone never renders an unregistered client copy', async () => {
    ports.rpc.mockResolvedValue({ data: { status: 'unknown' }, error: null });
    const value = { ...options, scope: { ...scope, course: { ...scope.course!, source_course_id: otherId } } };
    const { container } = render(<View value={value} />); await settleRpc();
    expect(container.querySelector('h2,table')).toBeNull(); expect(container.textContent).toBe(html);
  });

  it('HP07 raw content, owner and context changes synchronously remove an earlier rich view', async () => {
    const { container, rerender } = render(<View />);
    expect(await screen.findByRole('heading', { name: 'Проверяемая практика' })).toBeTruthy();
    ports.rpc.mockReturnValue(new Promise(() => {}));
    for (const value of [
      { ...options, content: html + '<p>Другая редакция</p>' },
      { ...options, scope: { ...scope, course: { id: courseId, organization_id: otherId } } },
      { ...options, contextKey: 'different-preview-context' },
    ]) { rerender(<View value={value} />); expect(container.querySelector('h2,table')).toBeNull(); }
  });

  it('HP08 a late earlier-route proof is ignored after navigation and on unmount', async () => {
    const pending = deferred<{ data: unknown; error: null }>(); ports.rpc.mockReturnValue(pending.promise);
    const { result, rerender, unmount } = renderHook(value => usePlatformHomeworkTaskProof(value), { initialProps: options });
    await waitFor(() => expect(ports.rpc).toHaveBeenCalledTimes(1));
    const signal = ports.rpc.mock.calls[0][2] as AbortSignal;
    rerender({ ...options, scope: { ...scope, routeCourseId: otherId } });
    expect(result.current.proof).toBeNull(); expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve({ data: verified(), error: null }); await pending.promise; });
    expect(result.current.proof).toBeNull(); unmount();
  });

  it('HP09 same-ID auth/access epoch invalidation immediately revokes the proof', async () => {
    const { result } = renderHook(() => usePlatformHomeworkTaskProof(options));
    await waitFor(() => expect(result.current.proof).not.toBeNull());
    ports.rpc.mockReturnValue(new Promise(() => {}));
    act(() => { observeOfflineAccess(actorId, 'new-role-access-fingerprint'); });
    expect(result.current.proof).toBeNull();
    act(() => { setOfflineAuthActor(null); setOfflineAuthActor(actorId); });
    expect(result.current.proof).toBeNull();
  });

  it('HP10 a completed proof expires and starts fresh verification after its finite lease', async () => {
    vi.useFakeTimers();
    const digest = new Uint8Array(createHash('sha256').update(html, 'utf8').digest()).buffer;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(digest) } });
    const { result } = renderHook(() => usePlatformHomeworkTaskProof(options));
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(result.current.proof).not.toBeNull(); expect(ports.rpc).toHaveBeenCalledTimes(1);
    ports.rpc.mockReturnValue(new Promise(() => {}));
    await act(async () => { vi.advanceTimersByTime(30_001); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(result.current.proof).toBeNull(); expect(ports.rpc).toHaveBeenCalledTimes(2);
  });

  it('HP11 verified copies use the unchanged real sanitizer and retain original CSS', async () => {
    const content = '<h2 onclick="bad()">Безопасная практика</h2><script>bad()</script><iframe srcdoc="bad"></iframe><a href="javascript:bad()">Ссылка</a>';
    ports.rpc.mockResolvedValue({ data: verified(content), error: null });
    const { container } = render(<View value={{ ...options, content }} />);
    expect(await screen.findByRole('heading', { name: 'Безопасная практика' })).toBeTruthy();
    expect(container.querySelector('script,iframe,[onclick],[srcdoc]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(screen.getByRole('document').classList.contains('text-sm')).toBe(true);
  });

  it('HP12 the existing direct current platform-owner path still works without RPC or proof', () => {
    const own = { ...scope, course: { id: courseId, organization_id: MARKETPLACE_ORG_ID } };
    render(<HomeworkTaskDescription content={html} scope={own} />);
    expect(screen.getByRole('heading', { name: 'Проверяемая практика' })).toBeTruthy(); expect(ports.rpc).not.toHaveBeenCalled();
  });
});
