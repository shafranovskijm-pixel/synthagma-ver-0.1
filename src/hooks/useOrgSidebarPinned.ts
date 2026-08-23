import { useCallback, useEffect, useRef, useState } from "react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

const PINNED_KEY = "org-sidebar-pinned";
const RECENT_ACTIONS_KEY = "org-recent-actions";
const MAX_RECENT = 4;

function scopedKey(baseKey: string, organizationId: string | null | undefined): string | null {
  return organizationId ? `${baseKey}:${organizationId}` : null;
}

function readStoredArray<T>(key: string | null): T[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Keeps UI history isolated by organization. This matters both for owners with
 * several memberships and for an administrator switching between organizations:
 * pinned sections and recent actions from tenant A must never appear in tenant B.
 */
function useOrganizationScopedArray<T>(baseKey: string) {
  const { organizationId } = useOrgDashboard();
  const storageKey = scopedKey(baseKey, organizationId);
  const activeKeyRef = useRef(storageKey);
  const [value, setValue] = useState<T[]>(() => readStoredArray<T>(storageKey));

  useEffect(() => {
    activeKeyRef.current = storageKey;
    setValue(readStoredArray<T>(storageKey));
  }, [storageKey]);

  const update = useCallback((updater: (current: T[]) => T[]) => {
    setValue((current) => {
      const next = updater(current);
      const key = activeKeyRef.current;
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // The in-memory preference remains usable when storage is unavailable.
        }
      }
      return next;
    });
  }, []);

  return [value, update] as const;
}

export function useOrgSidebarPinned() {
  const [pinned, setPinned] = useOrganizationScopedArray<string>(PINNED_KEY);

  const toggle = useCallback((tab: string) => {
    setPinned((current) => current.includes(tab)
      ? current.filter((item) => item !== tab)
      : [...current, tab]);
  }, [setPinned]);

  const isPinned = useCallback((tab: string) => pinned.includes(tab), [pinned]);

  return { pinned, toggle, isPinned };
}

export interface RecentAction {
  id: string;
  label: string;
  // last used timestamp
  ts: number;
}

export function useRecentActions() {
  const [recent, setRecent] = useOrganizationScopedArray<RecentAction>(RECENT_ACTIONS_KEY);

  const track = useCallback((action: { id: string; label: string }) => {
    setRecent((current) => {
      const filtered = current.filter((item) => item.id !== action.id);
      return [{ ...action, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    });
  }, [setRecent]);

  return { recent, track };
}
