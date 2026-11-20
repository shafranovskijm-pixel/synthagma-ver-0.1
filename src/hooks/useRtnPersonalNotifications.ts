import { useCallback, useEffect, useRef, useState } from "react";
import { getMyRtnNotifications, markMyRtnNotificationsRead, notifyRtnPersonalRefresh, RTN_PERSONAL_REFRESH } from "@/api/rtn-personal-notifications";
import type { RtnPersonalNotificationPage, RtnPersonalScope } from "@/types/rtn-personal-notifications";
export function useRtnPersonalNotifications(scope: RtnPersonalScope, enabled: boolean, open: boolean) {
  const key = `${scope.actorId}:${scope.organizationId}:${enabled}`;
  const owner = useRef(key); owner.current = key;
  const alive = useRef(false), busy = useRef(false), queued = useRef(false), request = useRef(0), minimumGeneration = useRef(0), cursor = useRef<number | undefined>(undefined);
  const [state, setState] = useState<{ key: string; data?: RtnPersonalNotificationPage; error?: unknown; loading: boolean }>({ key, loading: false });
  const refresh = useCallback(async (before = cursor.current) => {
    if (!enabled || !alive.current || document.visibilityState === "hidden" || busy.current) return;
    busy.current = true; const current = ++request.current, requestKey = key;
    setState(previous => ({ ...(previous.key === requestKey ? previous : {}), key: requestKey, loading: true, error: undefined }));
    try {
      const data = await getMyRtnNotifications(scope, { limit: 20, beforeSequence: before });
      if (alive.current && owner.current === requestKey && current === request.current) {
        if (data.subscription_generation < minimumGeneration.current) throw new Error("Настройки обновились. Повторите проверку личных уведомлений.");
        minimumGeneration.current = data.subscription_generation; cursor.current = before;
        setState({ key: requestKey, data, loading: false });
      }
    } catch (error) { if (alive.current && owner.current === requestKey && current === request.current) setState({ key: requestKey, error, loading: false }); }
    finally { if (current === request.current) { busy.current = false; if (queued.current) { queued.current = false; void refresh(); } } }
  }, [key]);
  useEffect(() => {
    alive.current = true; busy.current = false; cursor.current = undefined; minimumGeneration.current = 0;
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const ownChange = (event: Event) => { const detail = (event as CustomEvent<RtnPersonalScope & { generation?: number }>).detail; if (detail?.actorId === scope.actorId && detail?.organizationId === scope.organizationId) { if (Number.isSafeInteger(detail.generation)) minimumGeneration.current = Math.max(minimumGeneration.current, detail.generation!); if (busy.current) queued.current = true; else void refresh(); } };
    void refresh(); const timer = window.setInterval(visible, 60_000);
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible); window.addEventListener(RTN_PERSONAL_REFRESH, ownChange);
    return () => { alive.current = false; request.current++; busy.current = false; queued.current = false; window.clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); window.removeEventListener(RTN_PERSONAL_REFRESH, ownChange); };
  }, [key, refresh]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  const mark = async (ids: string[]) => {
    if (!enabled || owner.current !== key || !alive.current || !ids.length) return;
    const requestKey = key;
    await markMyRtnNotificationsRead(scope, ids);
    if (owner.current === requestKey && alive.current) notifyRtnPersonalRefresh(scope);
  };
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: state.key === key && state.loading, refresh, mark,
    next: () => { if (state.key === key && state.data?.next_before_sequence != null) void refresh(state.data.next_before_sequence); }, latest: () => { cursor.current = undefined; void refresh(); }, older: cursor.current !== undefined };
}
