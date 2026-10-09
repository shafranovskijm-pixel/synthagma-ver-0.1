import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const testState = vi.hoisted(() => ({
  storedTheme: null as string | null,
  storeThemeId: vi.fn(),
  proxiedAssetUrl: vi.fn(),
}));

vi.mock("@/constants/admin-themes", () => ({
  ADMIN_THEMES: [
    { id: "forest", label: "Лес", bannerUrl: "https://theme.example.test/forest.jpg", bannerPosition: "center 40%" },
    { id: "sea", label: "Море", bannerUrl: "https://theme.example.test/sea.jpg", bannerPosition: "center" },
  ],
  getStoredThemeId: () => testState.storedTheme,
  getThemeById: vi.fn(),
  storeThemeId: testState.storeThemeId,
}));

vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: testState.proxiedAssetUrl }));

import { OrgBanner } from "@/components/student/OrgBanner";

const COVER_URL = "https://storage.example.test/org/cover.png";
const PROXIED_COVER_URL = "https://api.example.test/sb-storage/object/public/org-branding/org/cover.png";

beforeEach(() => {
  vi.clearAllMocks();
  testState.storedTheme = null;
  testState.proxiedAssetUrl.mockImplementation((url: string | undefined) => url === COVER_URL ? PROXIED_COVER_URL : url || "");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("learner organization cover", () => {
  it("shows the saved cover instead of an existing theme and blocks theme gestures", () => {
    testState.storedTheme = "sea";
    const { container } = render(<OrgBanner orgName="СГТ" coverUrl={COVER_URL} />);
    const image = screen.getByRole("img", { name: "Обложка организации" });

    expect(image.getAttribute("src")).toBe(PROXIED_COVER_URL);
    expect(testState.proxiedAssetUrl).toHaveBeenCalledWith(COVER_URL);
    expect(screen.queryByRole("button", { name: "Следующая тема" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Предыдущая тема" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Лес" })).toBeNull();
    const banner = container.firstElementChild!;
    fireEvent.touchStart(banner, { touches: [{ clientX: 200, clientY: 20 }] });
    fireEvent.touchEnd(banner, { changedTouches: [{ clientX: 50, clientY: 20 }] });
    act(() => window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: "forest" })));

    expect(testState.storeThemeId).not.toHaveBeenCalled();
    expect(image.getAttribute("src")).toBe(PROXIED_COVER_URL);
    expect(container.querySelector('[style*="theme.example.test"]')).toBeNull();
  });

  it.each([
    { position: "contain", fit: "contain", alignment: "center center" },
    { position: "top", fit: "cover", alignment: "center top" },
    { position: "bottom", fit: "cover", alignment: "center bottom" },
    { position: "unknown", fit: "cover", alignment: "center center" },
  ])("honors the saved cover position $position", ({ position, fit, alignment }) => {
    render(<OrgBanner orgName="СГТ" coverUrl={COVER_URL} coverPosition={position} />);
    const image = screen.getByRole("img", { name: "Обложка организации" }) as HTMLImageElement;
    expect(image.style.objectFit).toBe(fit);
    expect(image.style.objectPosition).toBe(alignment);
  });

  it("keeps theme selection and swipe available when there is no saved cover", () => {
    vi.useFakeTimers();
    const { container } = render(<OrgBanner orgName="СГТ" />);
    expect(screen.queryByRole("img", { name: "Обложка организации" })).toBeNull();
    expect(container.querySelector('[style*="forest.jpg"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Следующая тема" }));
    expect(testState.storeThemeId).toHaveBeenLastCalledWith("sea");
    const banner = container.firstElementChild!;
    fireEvent.touchStart(banner, { touches: [{ clientX: 200, clientY: 20 }] });
    fireEvent.touchEnd(banner, { changedTouches: [{ clientX: 50, clientY: 20 }] });
    expect(testState.storeThemeId).toHaveBeenLastCalledWith("forest");
    act(() => vi.runAllTimers());
  });

  it("restores the theme fallback after the saved cover is removed", () => {
    testState.storedTheme = "sea";
    const { rerender, container } = render(<OrgBanner orgName="СГТ" coverUrl={COVER_URL} />);
    rerender(<OrgBanner orgName="СГТ" coverUrl="" />);

    expect(screen.queryByRole("img", { name: "Обложка организации" })).toBeNull();
    expect(screen.getByRole("button", { name: "Следующая тема" })).toBeTruthy();
    expect(container.querySelector('[style*="sea.jpg"]')).not.toBeNull();
  });
});
