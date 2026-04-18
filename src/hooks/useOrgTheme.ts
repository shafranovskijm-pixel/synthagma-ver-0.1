import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storeThemeId } from "@/constants/admin-themes";
import { storeAnimationLevel, type AnimationLevel } from "@/components/ui/ThemeAnimations";

export type OrgThemeMode = "light" | "dark" | "system";

export interface OrgThemeSettings {
  themeId: string | null;
  themeMode: OrgThemeMode;
  animLevel: AnimationLevel;
}

const DEFAULT_THEME: OrgThemeSettings = {
  themeId: null,
  themeMode: "light",
  animLevel: "full",
};

const cacheKey = (orgId: string) => `org-theme-cache:${orgId}`;

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
  };
}

/**
 * Loads the org theme from DB, applies it, and exposes a saver.
 * If no orgId is provided, this hook is a no-op (returns defaults).
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

  // Fetch from DB on mount/orgId change
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .maybeSingle();
      if (cancelled) return;
      const next = readBrandingTheme(data?.branding);
      setTheme(next);
      setLoaded(true);
      try {
        sessionStorage.setItem(cacheKey(organizationId), JSON.stringify(next));
      } catch {}
      applyOrgTheme(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

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
      const newBranding = { ...current, orgTheme: merged };
      const { error } = await supabase
        .from("organizations")
        .update({ branding: newBranding })
        .eq("id", organizationId);
      if (error) throw error;
      setTheme(merged);
      try {
        sessionStorage.setItem(cacheKey(organizationId), JSON.stringify(merged));
      } catch {}
      applyOrgTheme(merged);
    },
    [organizationId, theme]
  );

  return { theme, saveTheme, loaded };
}
