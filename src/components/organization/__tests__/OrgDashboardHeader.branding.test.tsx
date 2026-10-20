import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applySharedTheme, DEFAULT_THEME_PREFERENCES } from "@/lib/themePreferences";

const testState = vi.hoisted(() => ({
  coverUrl: "",
  coverPosition: "cover",
  activeTab: "home",
  isPostpaid: false,
  organizationId: "org-1" as string | null,
  organizationLoading: false,
  subscriptionReady: true,
  subscriptionLoading: false,
  subscriptionError: null as string | null,
  plan: "start",
  paidUntil: null as string | null,
  setActiveTab: vi.fn(),
  proxiedAssetUrl: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: testState.organizationId,
    isLoadingCourses: testState.organizationLoading,
    organizationName: "СГТ",
    branding: { brandingSettings: { customName: "", logoUrl: "", coverUrl: testState.coverUrl, coverPosition: testState.coverPosition } },
    tabNavigation: { activeTab: testState.activeTab, setActiveTab: testState.setActiveTab },
    subscriptionLimits: { plan: testState.plan, isPostpaid: testState.isPostpaid, loading: testState.subscriptionLoading, error: testState.subscriptionError, accessReady: testState.subscriptionReady && !testState.subscriptionLoading && !testState.subscriptionError },
    user: { email: "admin@example.test" },
    setIsMobileSidebarOpen: vi.fn(),
    handleLogout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useOrgNewIndicators", () => ({ useOrgNewIndicators: () => ({ whatsNew: 0 }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: testState.setTheme }) }));
vi.mock("@/components/organization/OrgNotifications", () => ({ OrgNotifications: () => null }));
vi.mock("@/components/organization/QuickActionChips", () => ({ QuickActionChips: () => null }));
vi.mock("@/components/organization/SectionBreadcrumbDropdown", () => ({ SectionBreadcrumbDropdown: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("@/components/shared/AnnouncementsBell", () => ({ AnnouncementsBell: () => null }));
vi.mock("@/components/radio/RadioPlayerButton", () => ({ RadioPlayerButton: () => null }));
vi.mock("@/components/account/AccountSettingsLink", () => ({ AccountSettingsMenuItem: () => null }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: testState.proxiedAssetUrl }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { paid_until: testState.paidUntil }, error: null }) }) }) }) },
}));

import { OrgDashboardHeader } from "@/components/organization/OrgDashboardHeader";

const COVER_URL = "https://storage.example.test/org/cover.png";
const PROXIED_COVER_URL = "https://api.example.test/sb-storage/object/public/org-branding/org/cover.png";

function renderHeader() {
  return render(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  testState.coverUrl = "";
  testState.coverPosition = "cover";
  testState.activeTab = "home";
  testState.isPostpaid = false;
  testState.organizationId = "org-1";
  testState.organizationLoading = false;
  testState.subscriptionReady = true;
  testState.subscriptionLoading = false;
  testState.subscriptionError = null;
  testState.plan = "start";
  testState.paidUntil = null;
  testState.proxiedAssetUrl.mockImplementation((url: string) => url === COVER_URL ? PROXIED_COVER_URL : url || "");
});

afterEach(cleanup);

describe("organization dashboard cover", () => {
  it("keeps the first null-context header neutral instead of claiming a free plan", () => {
    testState.organizationId = null; testState.organizationLoading = true;
    testState.subscriptionReady = false; testState.plan = "free";
    renderHeader();
    expect(screen.getAllByText("Кабинет загружается…")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Проверяем условия…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Бесплатный")).not.toBeInTheDocument();
    expect(screen.queryByText("СГТ")).not.toBeInTheDocument();
  });
  it.each(["unverified", "error"])("does not label an unconfirmed free fallback as a plan while %s", mode => {
    testState.subscriptionReady = false; testState.plan = "free";
    if (mode === "error") testState.subscriptionError = "unconfirmed";
    renderHeader();
    expect(screen.getByRole("button", { name: "Условия не подтверждены" })).toBeInTheDocument();
    expect(screen.queryByText("Бесплатный")).not.toBeInTheDocument();
  });
  it("distinguishes a resolved missing organization from an endless loading state", () => {
    testState.organizationId = null; testState.subscriptionReady = false;
    renderHeader();
    expect(screen.getAllByText("Кабинет организации")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Условия не подтверждены" })).toHaveAttribute("aria-busy", "false");
  });
  it("shows verified billing without waiting for the independent courses list", () => {
    testState.organizationLoading = true;
    renderHeader();
    expect(screen.getByRole("button", { name: "Старт" })).toBeInTheDocument();
    expect(screen.queryByText("Проверяем условия…")).not.toBeInTheDocument();
  });
  it("transitions from null context to billing pending and then postpaid without a free badge", () => {
    testState.organizationId = null; testState.organizationLoading = true;
    testState.subscriptionReady = false; testState.plan = "free";
    const view = renderHeader();
    testState.organizationId = "org-1"; testState.subscriptionLoading = true;
    view.rerender(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Проверяем условия…" })).toBeInTheDocument();
    testState.subscriptionLoading = false; testState.subscriptionReady = true; testState.isPostpaid = true;
    view.rerender(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Постоплата" })).toBeInTheDocument();
    expect(screen.queryByText("Бесплатный")).not.toBeInTheDocument();
  });
  it("retains the real free label and subscription navigation after verification", () => {
    testState.plan = "free";
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Бесплатный" }));
    expect(testState.setActiveTab).toHaveBeenCalledWith("subscription");
  });
  it("replaces the expired prepaid badge when postpaid access becomes active", async () => {
    testState.paidUntil = "2026-02-26T00:00:00Z";
    const { rerender } = renderHeader();
    expect(await screen.findByRole("button", { name: "Старт — 0 дн." })).toBeInTheDocument();

    testState.isPostpaid = true;
    rerender(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
    const billing = screen.getByRole("button", { name: "Постоплата" });
    expect(screen.queryByText(/0 дн\./)).not.toBeInTheDocument();
    fireEvent.click(billing);
    expect(testState.setActiveTab).toHaveBeenCalledWith("subscription");

    testState.isPostpaid = false;
    rerender(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Старт — 0 дн." })).toBeInTheDocument();
  });

  it("does not override the shared mode through the header logo", () => {
    applySharedTheme(DEFAULT_THEME_PREFERENCES);
    renderHeader();
    const control = screen.getByRole("button", { name: "Оформление задаётся организацией" });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(testState.setTheme).not.toHaveBeenCalled();
  });
  it("labels the CRM beta in the client breadcrumb", () => {
    testState.activeTab = "sales";
    renderHeader();
    expect(screen.getByText("CRM · Бета")).toBeInTheDocument();
    expect(screen.getByText("Клиенты")).toBeInTheDocument();
  });
  it("renders the saved image outside the sticky navigation and keeps navigation working", () => {
    testState.coverUrl = COVER_URL;
    const { container } = renderHeader();
    const image = screen.getByRole("img", { name: "Обложка организации" });
    const stickyHeader = container.querySelector("[data-org-sticky-header]")!;
    const cover = container.querySelector("[data-org-branding-cover]")!;

    expect(image.getAttribute("src")).toBe(PROXIED_COVER_URL);
    expect(testState.proxiedAssetUrl).toHaveBeenCalledWith(COVER_URL);
    expect(stickyHeader.contains(image)).toBe(false);
    expect(stickyHeader.nextElementSibling).toBe(cover);
    expect(cover.className).toContain("h-28 sm:h-36 lg:h-40");
    expect(cover.className).not.toMatch(/sticky|fixed/);
    fireEvent.click(screen.getByRole("button", { name: "СГТ" }));
    expect(testState.setActiveTab).toHaveBeenCalledWith("home");
  });

  it.each([
    { position: "contain", fit: "contain", alignment: "center center" },
    { position: "top", fit: "cover", alignment: "center top" },
    { position: "bottom", fit: "cover", alignment: "center bottom" },
  ])("uses the organization setting $position", ({ position, fit, alignment }) => {
    testState.coverUrl = COVER_URL;
    testState.coverPosition = position;
    renderHeader();
    const image = screen.getByRole("img", { name: "Обложка организации" }) as HTMLImageElement;
    expect(image.style.objectFit).toBe(fit);
    expect(image.style.objectPosition).toBe(alignment);
  });

  it("keeps the original compact header when no cover has been saved", () => {
    const { container } = renderHeader();
    expect(screen.queryByRole("img", { name: "Обложка организации" })).toBeNull();
    expect(container.querySelector("[data-org-branding-cover]")).toBeNull();
    expect(container.querySelector("[data-org-sticky-header]")).not.toBeNull();
  });
});
