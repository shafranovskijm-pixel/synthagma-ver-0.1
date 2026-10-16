import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemePersonalization } from "./ThemePersonalization";
import { DEFAULT_THEME_PREFERENCES, readDeviceThemePreferences } from "@/lib/themePreferences";
import { ADMIN_THEMES } from "@/constants/admin-themes";

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("style"); });
afterEach(cleanup);
describe("theme controls", () => {
  it("keeps personal controls usable and saves animation, accent, density and radius across remounts", () => {
    const props = { isDarkMode: false, onToggleDark: vi.fn() };
    const first = render(<ThemePersonalization {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Выключена" }));
    fireEvent.click(screen.getByTitle("Синий"));
    fireEvent.click(screen.getByRole("button", { name: "Компактный" }));
    fireEvent.click(screen.getByRole("button", { name: "Мягкие" }));
    first.unmount();
    render(<ThemePersonalization {...props} />);
    expect(readDeviceThemePreferences()).toMatchObject({ animLevel: "none", accentHsl: "217 91% 60%", density: "compact", radius: "soft" });
    expect(screen.getByRole("button", { name: "Компактный" })).toHaveClass("border-accent");
    expect(screen.getByRole("button", { name: "Мягкие" })).toHaveClass("border-accent");
    expect(screen.getByRole("button", { name: "Выключена" })).toHaveClass("border-accent");
  });

  it("controlled org edits emit partial patches without mutating effective device settings before confirmation", () => {
    const change = vi.fn();
    render(<ThemePersonalization isDarkMode={false} onToggleDark={vi.fn()} value={DEFAULT_THEME_PREFERENCES} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Тёмная" }));
    fireEvent.click(screen.getByRole("button", { name: "Уменьшена" }));
    fireEvent.click(screen.getByRole("button", { name: "Просторный" }));
    fireEvent.click(screen.getByRole("button", { name: "Острые" }));
    fireEvent.click(screen.getByTitle("Синий"));
    fireEvent.click(screen.getByRole("button", { name: /Природа/ }));
    fireEvent.click(screen.getByAltText(ADMIN_THEMES[0].label).closest("button")!);
    expect(change.mock.calls.map(([patch]) => patch)).toEqual([{ themeMode: "dark" }, { animLevel: "reduced" }, { density: "comfortable" }, { radius: "sharp" }, { accentHsl: "217 91% 60%" }, { themeId: ADMIN_THEMES[0].id, accentHsl: null }]);
    expect(readDeviceThemePreferences()).toEqual(DEFAULT_THEME_PREFERENCES);
  });
});
