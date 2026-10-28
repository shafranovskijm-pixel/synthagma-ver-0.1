import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { courseExactFileGateway } from "@/api/courseExactFileDelivery";
import {
  checkCourseExactFileSelection, type CourseExactFileSelection, type CourseFileDeliveryContext,
  type CopiedCourseExactFileLease,
} from "@/lib/courseExactFileDelivery";
import { captureOfflineAuthRevision, captureOfflineContext, subscribeOfflineAuthRevision } from "@/utils/courseCache";

export interface CourseExactFileViewScope extends CourseExactFileSelection {
  readonly authRevision: number;
  readonly effectiveUserId: string;
}
export type CourseExactFileView =
  | { readonly state: "idle" | "loading" | "held" }
  | { readonly state: "legacy"; readonly context: Extract<CourseFileDeliveryContext, { mode: "legacy" }> }
  | { readonly state: "exact"; readonly lease: CopiedCourseExactFileLease };
interface RenderTicket { readonly key: string; valid: boolean }
interface ViewSnapshot { readonly ticket: RenderTicket; readonly view: CourseExactFileView }

/** Online-only private lease. Its ordinary SQL RPC still enforces target enrollment and file rights. */
export function useCourseExactFileDelivery(scope: CourseExactFileViewScope | null, enabled: boolean) {
  const revision = useSyncExternalStore(subscribeOfflineAuthRevision, captureOfflineAuthRevision, captureOfflineAuthRevision);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const [snapshot, setSnapshot] = useState<ViewSnapshot | null>(null);
  const active = useRef<{ ticket: RenderTicket; abort: AbortController; lease: CopiedCourseExactFileLease | null } | null>(null);
  const renderTicket = useRef<RenderTicket | null>(null);

  // No credential, offline role, or cached URL is used to establish this scope.
  const auth = captureOfflineContext();
  let selected: Readonly<CourseExactFileSelection> | null = null;
  try {
    if (scope && enabled && visible && auth?.actorId === scope.actorId && auth.revision === scope.authRevision
      && revision === scope.authRevision && Number.isSafeInteger(scope.authRevision) && scope.authRevision >= 0
      && scope.effectiveUserId === scope.actorId) selected = checkCourseExactFileSelection(scope);
  } catch { /* Malformed or stale scope cannot acquire a lease. */ }
  const key = selected && scope ? JSON.stringify([selected.actorId, selected.organizationId, selected.courseId,
    selected.referenceKind, selected.referenceId, selected.accessMode, selected.purpose,
    scope.effectiveUserId, scope.authRevision, refreshRevision]) : "inactive";
  if (!renderTicket.current || renderTicket.current.key !== key || !renderTicket.current.valid) renderTicket.current = { key, valid: true };
  const ticket = renderTicket.current;

  const invalidate = useCallback(() => {
    if (renderTicket.current) renderTicket.current.valid = false;
    const current = active.current;
    current?.abort.abort();
    current?.lease?.release();
    if (current) current.lease = null;
    setRefreshRevision(value => value + 1);
  }, []);

  // Account/role invalidation revokes the private URL synchronously, before React publishes the new epoch.
  useEffect(() => subscribeOfflineAuthRevision(invalidate), [invalidate]);

  useEffect(() => {
    const updateVisibility = () => {
      invalidate();
      setVisible(document.visibilityState === "visible");
    };
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, [invalidate]);

  useEffect(() => {
    const previous = active.current;
    previous?.abort.abort(); previous?.lease?.release();
    const request = { ticket, abort: new AbortController(), lease: null as CopiedCourseExactFileLease | null };
    active.current = request;
    const current = () => active.current === request && renderTicket.current === ticket && ticket.valid
      && !request.abort.signal.aborted && captureOfflineContext()?.actorId === scope?.actorId
      && captureOfflineAuthRevision() === scope?.authRevision;
    if (!selected) {
      setSnapshot({ ticket, view: { state: "idle" } });
    } else {
      setSnapshot({ ticket, view: { state: "loading" } });
      void (async () => {
        try {
          const context = await courseExactFileGateway.readContext(selected, request.abort.signal);
          if (!current()) return;
          if (context.mode === "legacy") {
            setSnapshot({ ticket, view: { state: "legacy", context } });
          } else if (context.state === "hold") {
            setSnapshot({ ticket, view: { state: "held" } });
          } else {
            const lease = await courseExactFileGateway.readBytes(selected, context, request.abort.signal);
            if (!current()) { lease.release(); return; }
            request.lease = lease;
            setSnapshot({ ticket, view: { state: "exact", lease } });
          }
        } catch {
          if (current()) setSnapshot({ ticket, view: { state: "held" } });
        }
      })();
    }
    return () => {
      request.abort.abort(); request.lease?.release(); request.lease = null;
      if (active.current === request) active.current = null;
    };
    // The render ticket covers every selected primitive, auth epoch, visibility, and explicit refresh.
    // Its identity changes on A → B → A as well as ordinary route changes, before effects publish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const view: CourseExactFileView = selected && snapshot?.ticket === ticket && ticket.valid ? snapshot.view : { state: "idle" };
  return { view, refresh: invalidate } as const;
}
