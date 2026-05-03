import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storeThemeId } from "@/constants/admin-themes";
import { storeAnimationLevel, type AnimationLevel } from "@/components/ui/ThemeAnimations";

export type OrgThemeMode = "light" | "dark" | "system";

export interface OrgThemeSettings {
  themeId: string | null;
  themeMode: OrgThemeMode;
  animLevel: AnimationLevel;
  enforce: boolean;
}

const DEFAULT_THEME: OrgThemeSettings = {
  themeId: null,
  themeMode: "light",
  animLevel: "full",
  enforce: false,
};

const cacheKey = (orgId: string) => `org-theme-cache:${orgId}`;
const ENFORCE_FLAG_KEY = "org-theme-enforce-active";

/**
 * Apply the organization's theme on the current device.
 * Writes to localStorage and dispatches the events listened to by:
 * OrganizationDashboard, OrgPageLayout, OrgSidebar, HeroBannerSwiper, ThemePersonalization.
 */
export function applyOrgTheme(theme: OrgThemeSettings) {
  // Visual theme (banner / atmosphere / animation kind)
  storeThemeId(theme.themeId);
  window.dispatchEvent(
    new CustomEvent("visual-theme-change", { detail: theme.themeId })
  );

  // Animation level
  storeAnimationLevel(theme.animLevel);
  window.dispatchEvent(
    new CustomEvent("visual-animation-change", { detail: theme.animLevel })
  );

  // Light / dark mode
  const root = document.documentElement;
  if (theme.themeMode === "dark") {
    root.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    root.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }
  window.dispatchEvent(new Event("theme"));
}

function readBrandingTheme(branding: any): OrgThemeSettings {
  const ot = (branding && (branding.orgTheme || branding.org_theme)) || {};
  return {
    themeId: ot.themeId ?? null,
    themeMode: (ot.themeMode as OrgThemeMode) || "light",
    animLevel: (ot.animLevel as AnimationLevel) || "full",
    enforce: ot.enforce === true,
  };
}

/**
 * Loads the org theme from DB, applies it (only if enforce=true), and exposes a saver.
 * Subscribes to realtime changes so other staff devices update without reload.
 */
export function useOrgTheme(organizationId: string | null | undefined) {
  const [theme, setTheme] = useState<OrgThemeSettings>(() => {
    if (!organizationId) return DEFAULT_THEME;
    try {
      const cached = sessionStorage.getItem(cacheKey(organizationId));
      if (cached) return { ...DEFAULT_THEME, ...JSON.parse(cached) };
    } catch {}
    return DEFAULT_THEME;
  });
  const [loaded, setLoaded] = useState(false);

  // Apply enforced theme + cache
  const applyAndCache = useCallback(
    (next: OrgThemeSettings, orgId: string) => {
      setTheme(next);
      try {
        sessionStorage.setItem(cacheKey(orgId), JSON.stringify(next));
      } catch {}
      if (next.enforce) {
        try {
          localStorage.setItem(ENFORCE_FLAG_KEY, "1");
        } catch {}
        applyOrgTheme(next);
      } else {
        try {
          localStorage.removeItem(ENFORCE_FLAG_KEY);
        } catch {}
      }
    },
    []
  );

  // Fetch from DB on mount/orgId change + subscribe to realtime
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .maybeSingle();
      if (cancelled) return;
      const next = readBrandingTheme(data?.branding);
      applyAndCache(next, organizationId);
      setLoaded(true);
    };

    load();

    // Realtime subscription: pick up branding changes from other devices
    const channel = supabase
      .channel(`org-theme:${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "organizations",
          filter: `id=eq.${organizationId}`,
        },
        (payload) => {
          if (cancelled) return;
          const next = readBrandingTheme((payload.new as any)?.branding);
          applyAndCache(next, organizationId);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [organizationId, applyAndCache]);

  const saveTheme = useCallback(
    async (next: Partial<OrgThemeSettings>) => {
      if (!organizationId) return;
      const merged: OrgThemeSettings = { ...theme, ...next };
      // Read current branding to preserve other fields (logoUrl, coverUrl, etc.)
      const { data: org } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .maybeSingle();
      const current = (org?.branding as Record<string, unknown>) || {};
      const newBranding = { ...current, orgTheme: { ...merged } } as Record<string, unknown>;
      const { error } = await supabase
        .from("organizations")
        .update({ branding: newBranding as any })
        .eq("id", organizationId);
      if (error) throw error;
      applyAndCache(merged, organizationId);
    },
    [organizationId, theme, applyAndCache]
  );

  return { theme, saveTheme, loaded };
}

/** True when the current org enforces a shared theme on this device. */
export function isOrgThemeEnforced(): boolean {
  try {
    return localStorage.getItem(ENFORCE_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}
