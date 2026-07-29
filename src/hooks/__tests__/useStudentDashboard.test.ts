import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/queryWrapper";
import { renderHook, act } from "@testing-library/react";

// Mock all external dependencies
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: "/", search: "", hash: "", state: null }),
}));

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
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });

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
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    expect(result.current.dashboardSettings).toMatchObject({
      showLibrary: true,
      showAchievements: true,
      showAiChat: true,
    });
  });

  it("has initial AI chat message", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
  });

  it("can toggle active tab", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    act(() => { result.current.setActiveTab("chat"); });
    expect(result.current.activeTab).toBe("chat");
    act(() => { result.current.setActiveTab("store"); });
    expect(result.current.activeTab).toBe("store");
  });

  it("can toggle modal states", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    act(() => { result.current.setShowVideoIdentification(true); });
    expect(result.current.showVideoIdentification).toBe(true);
    act(() => { result.current.setShowAchievements(true); });
    expect(result.current.showAchievements).toBe(true);
    act(() => { result.current.setShowDocumentsUpload(true); });
    expect(result.current.showDocumentsUpload).toBe(true);
  });

  it("can update input value", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    act(() => { result.current.setInputValue("Привет!"); });
    expect(result.current.inputValue).toBe("Привет!");
  });

  it("detects preview mode from localStorage", () => {
    localStorage.setItem("previewStudentDashboard", "true");
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    expect(typeof result.current.isPreviewMode).toBe("boolean");
  });

  it("provides formatTime utility", () => {
    const { result } = renderHook(() => useStudentDashboard(), { wrapper: createQueryWrapper() });
    expect(typeof result.current.formatTime).toBe("function");
  });
});
