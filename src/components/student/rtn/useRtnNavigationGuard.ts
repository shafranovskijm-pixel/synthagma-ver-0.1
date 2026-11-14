import { useEffect, useRef } from "react";

type ReadyRef = { current: boolean };
type Position = { index: number | null; href: string };

function position(): Position {
  const value: unknown = window.history.state?.idx;
  return { index: typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null, href: window.location.href };
}

// BrowserRouter/HashRouter 6.30 use history.state.idx and a bubbling popstate
// listener. Their documented useBlocker is for Data Routers, which this app
// does not use. Capture only native POP transitions while the RTN modal is open;
// never replace history methods, prototypes, entries or application routing.
export function useRtnNavigationGuard(input: {
  open: boolean; isCloseReadyRef: ReadyRef; onBlocked: () => void;
}) {
  const blocked = useRef(input.onBlocked);
  blocked.current = input.onBlocked;

  useEffect(() => {
    if (!input.open) return;
    let anchor = position();
    let restoring = false;
    let deferred = false;
    let notified = false;
    let restoreTimer: number | undefined;
    let replayTimer: number | undefined;
    let active = true;

    const atAnchor = () => {
      const current = position();
      return current.index === anchor.index && current.href === anchor.href;
    };
    const notify = () => { if (!notified) { notified = true; blocked.current(); } };
    const cancelTimers = () => { window.clearTimeout(restoreTimer); window.clearTimeout(replayTimer); };
    const replayWhenReady = () => {
      window.clearTimeout(replayTimer);
      if (!active || !deferred) return;
      if (!input.isCloseReadyRef.current) {
        replayTimer = window.setTimeout(replayWhenReady, 100);
        return;
      }
      deferred = false;
      notified = false;
      if (atAnchor()) return;
      // The address bar has already moved, but the router never received the
      // blocked event. Once answers are safe, replay the actual current entry.
      // This also handles legacy entries with no usable idx without guessing
      // Back/Forward direction or overwriting anyone's history state.
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    };

    const protect = (event: PopStateEvent) => {
      if (restoring) {
        event.stopImmediatePropagation();
        if (atAnchor()) {
          restoring = false;
          deferred = false;
          notified = false;
          cancelTimers();
        } else {
          // Rapid repeated Back or an unexpected restoration must not create a
          // recursive forward loop. The one outstanding traversal may finish;
          // otherwise its timeout falls back to safe deferred navigation.
          deferred = true;
          notify();
        }
        return;
      }
      if (input.isCloseReadyRef.current) {
        deferred = false;
        notified = false;
        cancelTimers();
        anchor = position();
        return;
      }
      event.stopImmediatePropagation();
      notify();
      const current = position();
      const delta = anchor.index !== null && current.index !== null ? anchor.index - current.index : null;
      if (delta !== null && delta !== 0 && Number.isSafeInteger(delta) && Math.abs(delta) < window.history.length) {
        restoring = true;
        restoreTimer = window.setTimeout(() => {
          if (!active || !restoring) return;
          restoring = false;
          deferred = !atAnchor();
          replayWhenReady();
        }, 500);
        window.history.go(delta);
      } else {
        deferred = true;
        replayWhenReady();
      }
    };

    window.addEventListener("popstate", protect, true);
    return () => {
      active = false;
      cancelTimers();
      window.removeEventListener("popstate", protect, true);
      if (deferred && input.isCloseReadyRef.current && !atAnchor()) {
        // Closing the now-safe modal can happen before the deferred poll.
        // Reconcile the router with the current entry once; no history write.
        window.setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state })), 0);
      }
    };
  }, [input.open, input.isCloseReadyRef]);
}
