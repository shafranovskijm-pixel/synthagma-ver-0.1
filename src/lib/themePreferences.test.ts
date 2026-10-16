import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_THEMES } from "@/constants/admin-themes";
import { applySharedTheme, applyThemePreferences, readDeviceThemePreferences, restorePersonalTheme, DEFAULT_THEME_PREFERENCES } from "./themePreferences";

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); document.documentElement.className = ""; });
describe("personal and shared theme persistence", () => {
  it("retains every shared setting and restores the personal choice after repeated shared applications", () => {
    const personal = { ...DEFAULT_THEME_PREFERENCES, themeId: ADMIN_THEMES[0].id, themeMode: "dark" as const, accentHsl: "217 91% 60%", density: "compact" as const, radius: "sharp" as const, animLevel: "none" as const };
    const shared = { ...DEFAULT_THEME_PREFERENCES, themeId: ADMIN_THEMES[1].id, accentHsl: "160 84% 39%", density: "comfortable" as const, radius: "soft" as const, animLevel: "reduced" as const };
    applyThemePreferences(personal);
    applySharedTheme(shared);
    expect(readDeviceThemePreferences()).toEqual(shared);
    expect(document.documentElement).toHaveClass("density-comfortable");
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe("1rem");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(shared.accentHsl);
    applySharedTheme({ ...shared, themeMode: "system" });
    restorePersonalTheme();
    expect(readDeviceThemePreferences()).toEqual(personal);
    expect(document.documentElement).toHaveClass("dark", "density-compact");
    restorePersonalTheme();
    expect(readDeviceThemePreferences()).toEqual(personal);
  });

  it("captures a new personal choice when shared mode is enabled again", () => {
    applyThemePreferences(DEFAULT_THEME_PREFERENCES);
    applySharedTheme({ ...DEFAULT_THEME_PREFERENCES, density: "compact" });
    restorePersonalTheme();
    applyThemePreferences({ ...DEFAULT_THEME_PREFERENCES, radius: "soft" });
    applySharedTheme(DEFAULT_THEME_PREFERENCES);
    restorePersonalTheme();
    expect(readDeviceThemePreferences().radius).toBe("soft");
  });
});
