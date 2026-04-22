import { useEffect, useState, useCallback } from "react";

const PINNED_KEY = "org-sidebar-pinned";

export function useOrgSidebarPinned() {
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinned)); } catch {}
  }, [pinned]);

  const toggle = useCallback((tab: string) => {
    setPinned((cur) => cur.includes(tab) ? cur.filter((t) => t !== tab) : [...cur, tab]);
  }, []);

  const isPinned = useCallback((tab: string) => pinned.includes(tab), [pinned]);

  return { pinned, toggle, isPinned };
}

const RECENT_ACTIONS_KEY = "org-recent-actions";
const MAX_RECENT = 4;

export interface RecentAction {
  id: string;
  label: string;
  // last used timestamp
  ts: number;
}

export function useRecentActions() {
  const [recent, setRecent] = useState<RecentAction[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_ACTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const track = useCallback((action: { id: string; label: string }) => {
    setRecent((cur) => {
      const filtered = cur.filter((a) => a.id !== action.id);
      const next = [{ ...action, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { recent, track };
}
