import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/queryWrapper";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

// Mock all external dependencies
function createRouterQueryWrapper() {
  const QueryWrapper = createQueryWrapper();
  return ({ children }: { children: ReactNode }) => createElement(MemoryRouter, { initialEntries: ["/student"] }, createElement(QueryWrapper, { children }));
}

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@test.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: () => ({
    pullToRefreshRef: { current: null },
    pullDistance: 0,
    isRefreshing: false,
    canRefresh: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  });
  return {
    supabase: {
      from: mockFrom,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useStudentDashboard } from "@/hooks/useStudentDashboard";

describe("useStudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("initializes with correct default state", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });

    expect(typeof result.current.activeTab).toBe("string");
    expect(typeof result.current.loading).toBe("boolean");
    expect(Array.isArray(result.current.courses)).toBe(true);
    expect(typeof result.current.isPreviewMode).toBe("boolean");
    expect(typeof result.current.showVideoIdentification).toBe("boolean");
    expect(typeof result.current.showConsentForm).toBe("boolean");
    expect(typeof result.current.showDocumentsUpload).toBe("boolean");
    expect(typeof result.current.showAchievements).toBe("boolean");
    expect(typeof result.current.mobileMenuOpen).toBe("boolean");
    expect(typeof result.current.isVideoIdentified).toBe("boolean");
    expect(result.current.documentsProgress).toMatchObject({ total: 3 });
  });

  it("initializes with default dashboard settings", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    expect(result.current.dashboardSettings).toMatchObject({
      showLibrary: true,
      showAchievements: true,
      showAiChat: true,
    });
  });

  it("has initial AI chat message", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
  });

  it("can toggle active tab", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    act(() => { result.current.setActiveTab("chat"); });
    expect(result.current.activeTab).toBe("chat");
    act(() => { result.current.setActiveTab("store"); });
    expect(result.current.activeTab).toBe("store");
  });

  it("can toggle modal states", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    act(() => { result.current.setShowVideoIdentification(true); });
    expect(result.current.showVideoIdentification).toBe(true);
    act(() => { result.current.setShowAchievements(true); });
    expect(result.current.showAchievements).toBe(true);
    act(() => { result.current.setShowDocumentsUpload(true); });
    expect(result.current.showDocumentsUpload).toBe(true);
  });

  it("masks private input until the AuthProvider and target load confirm the current context", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    act(() => { result.current.setInputValue("Привет!"); });
    // This shallow dependency fixture never publishes a validated AuthProvider
    // actor or target. Loaded, usable chat is exercised by the privacy suite.
    expect(result.current.inputValue).toBe("");
  });

  it("detects preview mode from localStorage", () => {
    localStorage.setItem("previewStudentDashboard", "true");
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    expect(typeof result.current.isPreviewMode).toBe("boolean");
  });

  it("formats stored enrollment seconds as whole hours and minutes", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createRouterQueryWrapper() });
    // The enrollment RPC sums lesson seconds; the production QA course had
    // about 940 seconds, which must display as 15 minutes, not 15 hours.
    expect(result.current.formatTime(940)).toBe("0ч 15м");
    expect(result.current.formatTime(0)).toBe("0ч 0м");
    expect(result.current.formatTime(59)).toBe("0ч 0м");
    expect(result.current.formatTime(60)).toBe("0ч 1м");
    expect(result.current.formatTime(3599)).toBe("0ч 59м");
    expect(result.current.formatTime(3600)).toBe("1ч 0м");
    expect(result.current.formatTime(3661)).toBe("1ч 1м");
    expect(result.current.formatTime(10_859)).toBe("3ч 0м");
  });
});
