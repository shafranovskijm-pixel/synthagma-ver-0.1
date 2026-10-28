import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { readCourseFileDeliveryMode } from "@/api/courseFileConsumer";
import { checkCourseFileModeSelection, type CourseFileDeliveryModeView, type CourseFileModeSelection } from "@/lib/courseFileConsumer";
import type { CourseFileAccessMode } from "@/lib/courseExactFileDelivery";
import { captureOfflineAuthRevision, captureOfflineContext, subscribeOfflineAuthRevision } from "@/utils/courseCache";
export interface CourseFileModeScope { readonly courseId: string | null | undefined; readonly organizationId: string | null | undefined; readonly accessMode: CourseFileAccessMode; readonly effectiveUserId?: string | null }
interface Ticket { readonly key: string; valid: boolean }
/** A course classification is metadata, never a byte/readiness or perpetual-right grant. */
export function useCourseFileDeliveryMode(scope: CourseFileModeScope, enabled = true) {
  const { user } = useAuth();
  const revision = useSyncExternalStore(subscribeOfflineAuthRevision, captureOfflineAuthRevision, captureOfflineAuthRevision);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const [snapshot, setSnapshot] = useState<{ ticket: Ticket; view: CourseFileDeliveryModeView } | null>(null);
  const ticketRef = useRef<Ticket | null>(null);
  const requestRef = useRef<{ ticket: Ticket; abort: AbortController } | null>(null);
  const auth = captureOfflineContext();
  const effective = scope.effectiveUserId === undefined ? user?.id : scope.effectiveUserId;
  let selected: Readonly<CourseFileModeSelection> | null = null;
  try {
    if (enabled && visible && user?.id && effective === user.id && auth?.actorId === user.id && auth.revision === revision) {
      selected = checkCourseFileModeSelection({ actorId: user.id, organizationId: scope.organizationId ?? null, courseId: scope.courseId || "", accessMode: scope.accessMode });
    }
  } catch { /* Unknown identity/tenant never becomes legacy. */ }
  const key = selected ? JSON.stringify([selected.actorId, selected.organizationId, selected.courseId, selected.accessMode, effective, revision, refreshRevision]) : "inactive";
  if (!ticketRef.current || ticketRef.current.key !== key || !ticketRef.current.valid) ticketRef.current = { key, valid: true };
  const ticket = ticketRef.current;
  const invalidate = useCallback(() => {
    if (ticketRef.current) ticketRef.current.valid = false;
    requestRef.current?.abort.abort();
    setRefreshRevision(value => value + 1);
  }, []);
  useEffect(() => subscribeOfflineAuthRevision(invalidate), [invalidate]);
  useEffect(() => {
    const visibility = () => { invalidate(); setVisible(document.visibilityState === "visible"); };
    window.addEventListener("focus", invalidate); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", invalidate); document.removeEventListener("visibilitychange", visibility); };
  }, [invalidate]);
  useEffect(() => {
    requestRef.current?.abort.abort();
    const request = { ticket, abort: new AbortController() }; requestRef.current = request;
    const current = () => requestRef.current === request && ticketRef.current === ticket && ticket.valid && !request.abort.signal.aborted
      && captureOfflineContext()?.actorId === selected?.actorId && captureOfflineAuthRevision() === revision;
    if (!selected) setSnapshot({ ticket, view: { state: "idle" } });
    else {
      setSnapshot({ ticket, view: { state: "loading" } });
      void readCourseFileDeliveryMode(selected, request.abort.signal).then(context => {
        if (!current()) return;
        setSnapshot({ ticket, view: context.mode === "legacy" ? { state: "legacy", context } : { state: "frozen_required", context } });
      }, () => { if (current()) setSnapshot({ ticket, view: { state: "held" } }); });
    }
    return () => { request.abort.abort(); if (requestRef.current === request) requestRef.current = null; };
    // Every identity/mode/auth/visibility/refresh primitive is captured in ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);
  const view: CourseFileDeliveryModeView = selected && snapshot?.ticket === ticket && ticket.valid ? snapshot.view : { state: "idle" };
  return { view, refresh: invalidate } as const;
}
