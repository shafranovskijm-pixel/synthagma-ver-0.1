import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineAuthRevision } from '@/utils/courseCache';
import { captureDocumentOutputFence } from '@/lib/documents/outputFence';

const SignatureReadOwner = createContext<() => void>(() => undefined);
export const SignatureReadScopeProvider = SignatureReadOwner.Provider;

/** A UI lifetime fence, not an authorization grant. The server still checks every read/write. */
export function useSignatureReadScope(identity: readonly unknown[], enabled = true) {
  const assertOwnerCurrent = useContext(SignatureReadOwner);
  const { user, userRole } = useAuth();
  const key = JSON.stringify([enabled, user?.id ?? null, userRole, captureOfflineAuthRevision(), ...identity]);
  const owner = useRef({ key, revision: 0, mounted: true });
  if (owner.current.key !== key) owner.current = { key, revision: owner.current.revision + 1, mounted: true };
  const revision = owner.current.revision;
  const renderFence = captureDocumentOutputFence();
  useLayoutEffect(() => { owner.current.mounted = true; return () => { owner.current.mounted = false; }; }, []);
  const capture = () => {
    return () => {
      assertOwnerCurrent();
      renderFence();
      if (!enabled || !owner.current.mounted || owner.current.key !== key || owner.current.revision !== revision) {
        throw new Error('Контекст изменился. Откройте документ заново.');
      }
    };
  };
  return { key: `${revision}:${key}`, capture, actorId: user?.id ?? null };
}
