import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLessonChat } from '../useLessonChat';
import { setOfflineAuthActor, captureOfflineActor, isOfflineActorCurrent } from '@/utils/courseCache';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn() }));
vi.mock('@/utils/safeInvoke', () => ({safeInvoke: mocks.invoke}));
vi.mock('sonner', () => ({toast: {error: mocks.error}}));
beforeEach(() => {vi.clearAllMocks(); setOfflineAuthActor(null); setOfflineAuthActor('a');});
afterEach(() => {cleanup(); setOfflineAuthActor(null);});
describe('lesson chat follows private presentation identity', () => {
  it.each(['success', 'error'])('ignores deferred old %s and resets before effects on A→B→A', async outcome => {
    let resolve!: (value: any) => void; mocks.invoke.mockReturnValue(new Promise(done => {resolve = done;}));
    const hook = renderHook(({actor}) => {
      const revision = captureOfflineActor(actor);
      return useLessonChat({contextKey: `${actor}:${revision}`, isContextCurrent: () => isOfflineActorCurrent(actor, revision), course: null, currentLesson: undefined, contentBlocks: []});
    }, {initialProps: {actor: 'a'}});
    act(() => hook.result.current.setChatInput('private A question')); let pending!: Promise<void>;
    act(() => {pending = hook.result.current.sendChatMessage();}); expect(hook.result.current.chatMessages).toHaveLength(1);
    act(() => {setOfflineAuthActor('b'); hook.rerender({actor: 'b'});}); expect(hook.result.current.chatMessages).toEqual([]);
    act(() => {setOfflineAuthActor('a'); hook.rerender({actor: 'a'});});
    await act(async () => {resolve(outcome === 'success' ? {data: {content: 'old private answer'}, error: null} : {data: null, error: new Error('old failure')}); await pending;});
    expect(hook.result.current.chatMessages).toEqual([]); expect(hook.result.current.isChatLoading).toBe(false); expect(mocks.error).not.toHaveBeenCalled();
  });
});
