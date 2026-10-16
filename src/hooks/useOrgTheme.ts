import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applySharedTheme, restorePersonalTheme, normalizeThemePreferences, initializeThemeSession, isSharedThemeEnforced, DEFAULT_THEME_PREFERENCES, type ThemePreferences } from "@/lib/themePreferences";

export type OrgThemeMode = ThemePreferences["themeMode"];
export interface OrgThemeSettings extends ThemePreferences { enforce: boolean }
const DEFAULT_THEME: OrgThemeSettings = { ...DEFAULT_THEME_PREFERENCES, enforce: false };
const cacheKey = (orgId: string) => `org-theme-cache:${orgId}`;
const UPDATE_EVENT = "org-theme-saved";
const saveQueues = new Map<string, Promise<unknown>>();
const activeConsumers = new Set<object>();

export function applyOrgTheme(theme: OrgThemeSettings) { applySharedTheme(theme); }
export function readBrandingTheme(branding: any): OrgThemeSettings {
  const value = branding?.orgTheme ?? branding?.org_theme ?? {};
  return { ...normalizeThemePreferences(value), enforce: value.enforce === true };
}
function readCache(orgId: string | null | undefined): OrgThemeSettings {
  try {
    const cached = orgId && sessionStorage.getItem(cacheKey(orgId));
    if (cached) return readBrandingTheme({ orgTheme: JSON.parse(cached) });
  } catch { /* corrupt storage is not authoritative */ }
  return DEFAULT_THEME;
}

export function useOrgTheme(organizationId: string | null | undefined) {
  const [theme, setTheme] = useState(() => readCache(organizationId));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingSaves = useRef(new Map<string, number>());
  const currentOrg = useRef(organizationId);
  currentOrg.current = organizationId;

  const applyAndCache = useCallback((next: OrgThemeSettings, orgId: string) => {
    if (currentOrg.current !== orgId) return;
    setTheme(next);
    setError(null);
    setLoaded(true);
    try { sessionStorage.setItem(cacheKey(orgId), JSON.stringify(next)); } catch { /* optional cache */ }
    if (next.enforce) applyOrgTheme(next);
    else restorePersonalTheme();
  }, []);

  useEffect(() => {
    initializeThemeSession();
    setTheme(readCache(organizationId));
    setLoaded(false);
    setError(null);
    setSaving(!!organizationId && (pendingSaves.current.get(organizationId) ?? 0) > 0);
    if (!organizationId) return;
    let cancelled = false;
    let revision = 0;
    const consumer = {};
    activeConsumers.add(consumer);
    const accept = (next: OrgThemeSettings) => {
      if (cancelled) return;
      revision++;
      applyAndCache(next, organizationId);
    };
    const onSaved = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (value.organizationId === organizationId) accept(value.theme);
    };
    window.addEventListener(UPDATE_EVENT, onSaved);
    const initialRevision = revision;
    const load = async () => {
      try {
        const result = await supabase.from("organizations").select("branding").eq("id", organizationId).maybeSingle();
        if (cancelled || revision !== initialRevision) return;
        if (result.error || !result.data) throw new Error("Не удалось загрузить тему организации");
        accept(readBrandingTheme(result.data.branding));
      } catch {
        if (!cancelled && revision === initialRevision) setError("Не удалось загрузить тему организации. Обновите страницу.");
      }
    };
    void load();
    const channel = supabase.channel(`org-theme:${organizationId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "organizations", filter: `id=eq.${organizationId}` },
        payload => accept(readBrandingTheme((payload.new as any)?.branding)))
      .subscribe();
    return () => {
      cancelled = true;
      activeConsumers.delete(consumer);
      window.removeEventListener(UPDATE_EVENT, onSaved);
      void supabase.removeChannel(channel);
      // Several layouts consume this hook. Restore only after the last one
      // leaves, allowing a replacement layout/StrictMode mount to take over.
      queueMicrotask(() => { if (activeConsumers.size === 0) restorePersonalTheme(); });
    };
  }, [organizationId, applyAndCache]);

  const saveTheme = useCallback(async (patch: Partial<OrgThemeSettings>) => {
    if (!organizationId) throw new Error("Организация не выбрана");
    const orgId = organizationId;
    pendingSaves.current.set(orgId, (pendingSaves.current.get(orgId) ?? 0) + 1);
    setSaving(true);
    // Order edits across consumers on this page; the RPC merges just the patch
    // against the locked database row, preserving logo and concurrent fields.
    const previous = saveQueues.get(orgId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const result = await supabase.rpc("update_organization_theme" as any, {
        p_organization_id: orgId, p_patch: patch,
      } as any);
      if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)
          || Object.entries(patch).some(([key, value]) => (result.data as Record<string, unknown>)[key] !== value)) {
        throw new Error("Не удалось сохранить тему организации");
      }
      const next = readBrandingTheme({ orgTheme: result.data });
      if (currentOrg.current === orgId) {
        window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { organizationId: orgId, theme: next } }));
      }
      return next;
    });
    saveQueues.set(orgId, task);
    try { return await task; }
    finally {
      const pending = (pendingSaves.current.get(orgId) ?? 1) - 1;
      if (pending > 0) pendingSaves.current.set(orgId, pending);
      else pendingSaves.current.delete(orgId);
      if (saveQueues.get(orgId) === task) saveQueues.delete(orgId);
      if (currentOrg.current === orgId) setSaving(pending > 0);
    }
  }, [organizationId]);
  return { theme, saveTheme, loaded, error, saving };
}

export function isOrgThemeEnforced(): boolean {
  return isSharedThemeEnforced();
}
