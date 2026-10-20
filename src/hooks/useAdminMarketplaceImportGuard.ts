import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { captureOfflineContext, isOfflineActorCurrent } from "@/utils/courseCache";
import { AdminMarketplaceImportError, resolveAdminMarketplaceImportScope, type AdminMarketplaceImportOperation } from "@/lib/adminMarketplaceImport";

export function useAdminMarketplaceImportGuard() {
  const { user, userRole, loading } = useAuth();
  const actor = captureOfflineContext();
  const identityKey = JSON.stringify([user?.id, userRole, loading, actor?.actorId, actor?.revision]);
  const identity = useRef({ key: identityKey, generation: 0 });
  if (identity.current.key !== identityKey) identity.current = { key: identityKey, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const mounted = useRef(true);
  const active = useRef<object | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const canStart = !loading && userRole === "admin" && !!user && actor?.actorId === user.id;
  const isIdentityCurrent = () => mounted.current && identity.current.generation === generation && !!actor
    && isOfflineActorCurrent(actor.actorId, actor.revision);

  useEffect(() => {
    active.current = null;
    setIsBusy(false);
  }, [identityKey]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current = null; };
  }, []);

  const start = (): AdminMarketplaceImportOperation => {
    const context = captureOfflineContext();
    if (!isIdentityCurrent() || !canStart || !user || context?.actorId !== user.id
      || identity.current.generation !== generation || active.current) {
      throw new AdminMarketplaceImportError("scope", "Дождитесь подтверждения прав администратора и завершения текущей операции");
    }
    const token = {};
    active.current = token;
    setIsBusy(true);
    const isCurrent = () => mounted.current && active.current === token && identity.current.generation === generation
      && isOfflineActorCurrent(context.actorId, context.revision);
    const assertCurrent = () => {
      if (!isCurrent()) throw new AdminMarketplaceImportError("stale", "Контекст импорта изменился. Запустите операцию снова");
    };
    return {
      isCurrent, assertCurrent,
      verify: () => resolveAdminMarketplaceImportScope(context.actorId, assertCurrent),
      finish: () => {
        if (active.current !== token) return;
        active.current = null;
        if (mounted.current && identity.current.generation === generation) setIsBusy(false);
      },
    };
  };

  return { canStart, isBusy, identityKey, isIdentityCurrent, start };
}
