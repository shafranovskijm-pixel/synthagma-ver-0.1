import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const setActiveTab = vi.fn();
let pinnedIds: string[] = [];
let allowedTabs = new Set<string>();
let menuSettings: Record<string, boolean> = {};

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    organizationName: "Учебный центр",
    unreadChatsCount: 2,
    tabNavigation: { activeTab: "courses", setActiveTab },
    branding: {
      brandingSettings: {
        logoUrl: null,
        primaryColor: "#14b8a6",
        customName: null,
      },
      handleLogoUpload: vi.fn(),
      isUploadingLogo: false,
    },
    subscriptionLimits: { plan: "start" },
    dashboardSettings: { menuSettings },
    isEnabled: () => true,
    isMobileSidebarOpen: false,
    setIsMobileSidebarOpen: vi.fn(),
    handleLogout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: false,
    canSeeOrgTab: (tab: string) => allowedTabs.has(tab),
  }),
}));

vi.mock("@/hooks/useOrgNewIndicators", () => ({
  useOrgNewIndicators: () => ({ homework: 0, sales: 0 }),
}));

vi.mock("@/hooks/useOrgSidebarPinned", () => ({
  useOrgSidebarPinned: () => ({
    pinned: pinnedIds,
    toggle: vi.fn(),
    isPinned: (tab: string) => pinnedIds.includes(tab),
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { OrgSidebar } from "@/components/organization/OrgSidebar";

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/organization"]}>
      <TooltipProvider>
        <OrgSidebar />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("org-sidebar-mode", "expanded");
  setActiveTab.mockClear();
  pinnedIds = [];
  allowedTabs = new Set([
    "students",
    "organizations",
    "chats",
    "courses",
    "homework-review",
    "labor-safety",
    "library",
    "services",
    "documents",
    "org-documents",
    "journals",
    "frdo",
    "sales",
    "stats",
    "links",
    "staff",
    "profile",
    "subscription",
    "settings",
  ]);
  menuSettings = {
    showStudents: true,
    showCompanies: true,
    showCourses: true,
    showLaborSafety: true,
    showLibrary: true,
    showServices: true,
    showDocuments: true,
    showJournals: true,
    showFrdo: true,
    showSales: true,
    showStats: true,
    showLinks: true,
    showSubscription: true,
  };
});

describe("OrgSidebar navigation", () => {
  it("starts expanded for a new user and respects a saved compact mode", () => {
    localStorage.clear();
    const firstRender = renderSidebar();
    expect(screen.getByRole("navigation", { name: "Основная навигация" })).toHaveStyle({
      width: "220px",
    });

    firstRender.unmount();
    localStorage.setItem("org-sidebar-mode", "compact");
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Основная навигация" })).toHaveStyle({
      width: "88px",
    });
  });

  it("auto-collapses on a tablet before persisting the first preference", () => {
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(max-width: 1279px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    localStorage.clear();

    const view = renderSidebar();
    expect(screen.getByRole("navigation", { name: "Основная навигация" })).toHaveStyle({
      width: "88px",
    });

    view.unmount();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  });

  it("keeps every existing workspace in clear sections with canonical links", () => {
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    expect(within(sidebar).getByText("Люди", { selector: "span[aria-hidden]" })).toBeInTheDocument();
    expect(within(sidebar).getByText("Обучение", { selector: "span[aria-hidden]" })).toBeInTheDocument();
    expect(within(sidebar).getByText("Документы", { selector: "span[aria-hidden]" })).toBeInTheDocument();
    expect(within(sidebar).getByText("Управление", { selector: "span[aria-hidden]" })).toBeInTheDocument();

    expect(within(sidebar).getByRole("link", { name: "Ученики" })).toHaveAttribute(
      "href",
      "/organization?tab=students",
    );
    expect(within(sidebar).getByRole("link", { name: "Документы" })).toHaveAttribute(
      "href",
      "/organization?tab=documents",
    );
    expect(screen.queryByRole("link", { name: "Документы организации" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ФИС ФРДО" })).toHaveAttribute(
      "href",
      "/organization?tab=frdo",
    );
    expect(screen.getByRole("link", { name: "Сотрудники" })).toHaveAttribute(
      "href",
      "/organization?tab=staff",
    );
    expect(screen.getByRole("link", { name: "Профиль организации" })).toHaveAttribute(
      "href",
      "/organization?tab=profile",
    );
    expect(screen.getByRole("link", { name: "Настройки" })).toHaveAttribute(
      "href",
      "/organization?tab=settings",
    );
    expect(screen.getByRole("link", { name: "Помощь" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("renders a pinned destination once instead of duplicating it in a section", () => {
    pinnedIds = ["courses"];
    renderSidebar();

    expect(screen.getAllByRole("link", { name: "Курсы" })).toHaveLength(1);
    expect(screen.getByText("Закреплено")).toBeInTheDocument();
  });

  it("shows Beta on the two explicitly experimental workspaces and honours visibility plus permissions", () => {
    menuSettings = { ...menuSettings, showDocuments: false };
    allowedTabs.delete("staff");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    const courseStoreLink = within(sidebar).getByRole("link", { name: "Готовые курсы" });
    const salesLink = within(sidebar).getByRole("link", { name: "Продажи" });

    expect(within(courseStoreLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(salesLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(sidebar).getAllByLabelText("Бета-версия")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Документы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Документы организации" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Сотрудники" })).not.toBeInTheDocument();
  });
});
