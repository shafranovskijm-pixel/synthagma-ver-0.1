import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ actor: 'actor-a', role: 'organization', revision: 1 }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: auth.actor }, userRole: auth.role }) }));
vi.mock('@/utils/courseCache', () => ({
  captureOfflineAuthRevision: () => auth.revision,
  captureOfflineContext: () => ({ actorId: auth.actor, revision: auth.revision }),
  isOfflineActorCurrent: (id: string, revision: number) => id === auth.actor && revision === auth.revision,
}));
import { useSignatureReadScope } from '../useSignatureReadScope';
beforeEach(() => { auth.actor = 'actor-a'; auth.role = 'organization'; auth.revision = 1; });
it('invalidates a captured callback on an observed document A→B→A transition', () => {
  const hook = renderHook(({ document }) => useSignatureReadScope([document]), { initialProps: { document: 'a' } });
  const original = hook.result.current.capture(); original();
  hook.rerender({ document: 'b' }); hook.rerender({ document: 'a' });
  expect(original).toThrow('Контекст изменился'); hook.result.current.capture()();
});
it('rejects a stale render callback even if auth changes before React can rerender', () => {
  const hook = renderHook(() => useSignatureReadScope(['document-a']));
  act(() => { auth.actor = 'actor-b'; auth.revision++; });
  expect(() => hook.result.current.capture()()).toThrow('Доступ изменился');
});
it('does not revive actor A after actor/access A→B→A, close or unmount', () => {
  const hook = renderHook(({ open }) => useSignatureReadScope(['doc'], open), { initialProps: { open: true } });
  const old = hook.result.current.capture(); auth.actor = 'actor-b'; auth.revision++; hook.rerender({ open: true });
  auth.actor = 'actor-a'; auth.revision++; hook.rerender({ open: true }); expect(old).toThrow();
  const current = hook.result.current.capture(); hook.rerender({ open: false }); expect(current).toThrow();
  hook.rerender({ open: true }); const reopened = hook.result.current.capture(); hook.unmount(); expect(reopened).toThrow();
});
