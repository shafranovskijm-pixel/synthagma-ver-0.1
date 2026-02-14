import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock all external dependencies
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

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
    const { result } = renderHook(() => useStudentDashboard());

    expect(result.current.activeTab).toBe("courses");
    expect(result.current.loading).toBe(true);
    expect(result.current.courses).toEqual([]);
    expect(result.current.isPreviewMode).toBe(false);
    expect(result.current.showVideoIdentification).toBe(false);
    expect(result.current.showConsentForm).toBe(false);
    expect(result.current.showDocumentsUpload).toBe(false);
    expect(result.current.showAchievements).toBe(false);
    expect(result.current.mobileMenuOpen).toBe(false);
    expect(result.current.isVideoIdentified).toBe(false);
    expect(result.current.documentsProgress).toEqual({ completed: 0, total: 3 });
  });

  it("initializes with default dashboard settings", () => {
    const { result } = renderHook(() => useStudentDashboard());
    expect(result.current.dashboardSettings).toEqual({
      showLibrary: true,
      showAchievements: true,
      showAiChat: true,
    });
  });

  it("has initial AI chat message", () => {
    const { result } = renderHook(() => useStudentDashboard());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
  });

  it("can toggle active tab", () => {
    const { result } = renderHook(() => useStudentDashboard());
    act(() => { result.current.setActiveTab("chat"); });
    expect(result.current.activeTab).toBe("chat");
    act(() => { result.current.setActiveTab("store"); });
    expect(result.current.activeTab).toBe("store");
  });

  it("can toggle modal states", () => {
    const { result } = renderHook(() => useStudentDashboard());
    act(() => { result.current.setShowVideoIdentification(true); });
    expect(result.current.showVideoIdentification).toBe(true);
    act(() => { result.current.setShowAchievements(true); });
    expect(result.current.showAchievements).toBe(true);
    act(() => { result.current.setShowDocumentsUpload(true); });
    expect(result.current.showDocumentsUpload).toBe(true);
  });

  it("can update input value", () => {
    const { result } = renderHook(() => useStudentDashboard());
    act(() => { result.current.setInputValue("Привет!"); });
    expect(result.current.inputValue).toBe("Привет!");
  });

  it("detects preview mode from localStorage", () => {
    localStorage.setItem("previewStudentDashboard", "true");
    const { result } = renderHook(() => useStudentDashboard());
    expect(result.current.isPreviewMode).toBe(true);
    // Should be cleaned up
    expect(localStorage.getItem("previewStudentDashboard")).toBeNull();
  });

  it("provides formatTime utility", () => {
    const { result } = renderHook(() => useStudentDashboard());
    expect(typeof result.current.formatTime).toBe("function");
  });
});
