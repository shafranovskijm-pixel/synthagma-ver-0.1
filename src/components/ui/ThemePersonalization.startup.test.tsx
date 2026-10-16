import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useThemePersonalization } from "./ThemePersonalization";
import { applySharedTheme, applyThemePreferences, initializeThemeSession, readDeviceThemePreferences, DEFAULT_THEME_PREFERENCES } from "@/lib/themePreferences";
const mocks = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: mocks.setTheme }) }));
afterEach(cleanup);
it("restores personal styling on a cold public/student route and does not erase a later org application", () => {
  localStorage.clear();
  const personal = { ...DEFAULT_THEME_PREFERENCES, themeMode: "dark" as const, density: "compact" as const, accentHsl: "217 91% 60%" };
  const shared = { ...DEFAULT_THEME_PREFERENCES, density: "comfortable" as const };
  applyThemePreferences(personal);
  applySharedTheme(shared); // persisted flag and effective settings from the previous page
  renderHook(useThemePersonalization); // no organization dashboard/consumer mounted
  expect(readDeviceThemePreferences()).toEqual(personal);
  expect(localStorage.getItem("org-theme-enforce-active")).toBeNull();
  expect(document.documentElement).toHaveClass("dark", "density-compact");
  expect(mocks.setTheme).toHaveBeenCalledWith("dark");
  act(() => {
    applySharedTheme(shared); // a later authorized organization load
    initializeThemeSession(); // another consumer/StrictMode startup pass
  });
  expect(readDeviceThemePreferences()).toEqual(shared);
  expect(localStorage.getItem("org-theme-enforce-active")).toBe("1");
});
