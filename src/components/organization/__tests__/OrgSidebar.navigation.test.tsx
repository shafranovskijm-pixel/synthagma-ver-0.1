import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const setActiveTab = vi.fn();
let pinnedIds: string[] = [];
let allowedTabs = new Set<string>();
let menuSettings: Record<string, boolean> = {};
let plan = "standard";
let emailCampaignsEnabled = true;
let salesCrmEnabled = true;
let activeTab = "home";

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    organizationName: "Учебный центр",
    unreadChatsCount: 2,
    tabNavigation: { activeTab, setActiveTab },
    branding: {
      brandingSettings: {
        logoUrl: null,
        primaryColor: "#14b8a6",
        customName: null,
      },
      handleLogoUpload: vi.fn(),
      isUploadingLogo: false,
    },
    subscriptionLimits: {
      plan,
      limits: { emailCampaignsEnabled, salesCrmEnabled },
    },
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
  plan = "standard";
  emailCampaignsEnabled = true;
  salesCrmEnabled = true;
  activeTab = "home";
  allowedTabs = new Set([
    "home",
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

  it("opens compact section children in a side flyout without inserting them into the icon rail", () => {
    localStorage.setItem("org-sidebar-mode", "icons");
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    fireEvent.click(within(sidebar).getByRole("button", { name: "Ученики" }));
    const studentsFlyout = screen.getByRole("navigation", { name: "Ученики: подразделы" });
    expect(sidebar.contains(studentsFlyout)).toBe(false);
    expect(within(studentsFlyout).getByRole("link", { name: "Ученики и группы" })).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    expect(screen.queryByRole("navigation", { name: "Ученики: подразделы" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Курсы: подразделы" })).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    expect(screen.queryByRole("navigation", { name: "Курсы: подразделы" })).not.toBeInTheDocument();
  });

  it("opens compact settings in the same flyout pattern", () => {
    localStorage.setItem("org-sidebar-mode", "compact");
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    fireEvent.click(within(sidebar).getByRole("button", { name: "Настройки" }));
    const settingsFlyout = screen.getByRole("navigation", { name: "Настройки: подразделы" });
    expect(sidebar.contains(settingsFlyout)).toBe(false);
    expect(within(settingsFlyout).getByRole("link", { name: "Сотрудники и доступы" })).toBeInTheDocument();
  });

  it("keeps every existing workspace inside seven semantic roots with canonical links", () => {
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    expect(within(sidebar).getByRole("link", { name: "Главная" })).toHaveAttribute("href", "/organization");
    expect(within(sidebar).getByRole("button", { name: "Курсы" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Ученики" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Компании" })).toHaveAttribute("href", "/organization?tab=organizations");
    expect(within(sidebar).getByRole("button", { name: "Коммуникации" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Документы" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Продажи" })).toHaveAttribute("href", "/organization?tab=sales");
    expect(within(sidebar).getByRole("link", { name: "Отчёты" })).toHaveAttribute("href", "/organization?tab=stats");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    expect(within(sidebar).getByRole("link", { name: "Все курсы" })).toHaveAttribute(
      "href",
      "/organization?tab=courses",
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Ученики" }));
    expect(within(sidebar).getByRole("link", { name: "Ученики и группы" })).toHaveAttribute(
      "href",
      "/organization?tab=students",
    );
    expect(within(sidebar).getByRole("link", { name: "Зачисление" })).toHaveAttribute(
      "href",
      "/organization?tab=students&studentsView=active",
    );
    expect(within(sidebar).getByRole("link", { name: "Ссылки регистрации" })).toHaveAttribute(
      "href",
      "/organization?tab=links",
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Коммуникации" }));
    expect(within(sidebar).getByRole("link", { name: "Рассылки" })).toHaveAttribute(
      "href",
      "/mailing/app?tab=overview",
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Документы" }));
    expect(within(sidebar).getByRole("link", { name: "Сводка" })).toHaveAttribute(
      "href",
      "/organization?tab=documents",
    );
    expect(within(sidebar).getByRole("link", { name: "Личные дела и документы групп" })).toHaveAttribute(
      "href",
      "/organization?tab=students&studentsView=groups",
    );
    expect(within(sidebar).getByRole("link", { name: "Договоры и закрывающие" })).toHaveAttribute(
      "href",
      "/organization?tab=documents&documentView=counterparties&counterpartyView=closing",
    );
    expect(within(sidebar).getByRole("link", { name: "ФИС ФРДО" })).toHaveAttribute(
      "href",
      "/organization?tab=frdo",
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Настройки" }));
    expect(within(sidebar).getByRole("link", { name: "Сотрудники и доступы" })).toHaveAttribute(
      "href",
      "/organization?tab=staff",
    );
    expect(within(sidebar).getByRole("link", { name: "Помощь" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("keeps a pinned destination once and lifts it only inside its semantic root", () => {
    pinnedIds = ["library"];
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Курсы" }));
    expect(screen.getAllByRole("link", { name: "Хранилище" })).toHaveLength(1);
    const courseChildren = screen.getByRole("navigation", { name: "Курсы: подразделы" });
    expect(within(courseChildren).getAllByRole("link")[0]).toHaveAccessibleName("Хранилище");
  });

  it("shows Beta only on experimental workspaces and honours visibility plus permissions", () => {
    menuSettings = { ...menuSettings, showDocuments: false };
    allowedTabs.delete("staff");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    const courseStoreLink = within(sidebar).getByRole("link", { name: "Готовые курсы" });
    const salesLink = within(sidebar).getByRole("link", { name: "Продажи" });

    expect(within(courseStoreLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(salesLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(sidebar).getAllByLabelText("Бета-версия")).toHaveLength(2);
    fireEvent.click(within(sidebar).getByRole("button", { name: "Документы" }));
    expect(screen.queryByRole("link", { name: "Сводка" })).not.toBeInTheDocument();
    fireEvent.click(within(sidebar).getByRole("button", { name: "Настройки" }));
    expect(screen.queryByRole("link", { name: "Сотрудники и доступы" })).not.toBeInTheDocument();
  });

  it("keeps the Reports root visible for a new organization even when legacy stats visibility is off", () => {
    menuSettings = { ...menuSettings, showStats: false };
    renderSidebar();

    expect(screen.getByRole("link", { name: "Отчёты" })).toHaveAttribute(
      "href",
      "/organization?tab=stats",
    );
  });

  it("does not expose document shortcuts that would bypass destination permissions", () => {
    allowedTabs.delete("students");
    allowedTabs.delete("organizations");
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Документы" }));
    expect(screen.queryByRole("link", { name: "Личные дела и документы групп" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Договоры и закрывающие" })).not.toBeInTheDocument();
  });

  it("shows locked mailing on Free, enables it on Start, and gates Sales by CRM tariff", () => {
    plan = "free";
    // Free remains locked even if a stale/custom limit flag is accidentally true.
    emailCampaignsEnabled = true;
    salesCrmEnabled = false;
    const freeView = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    const lockedMailing = screen.getByLabelText("Рассылки");
    expect(lockedMailing).not.toHaveAttribute("href");
    expect(screen.queryByRole("link", { name: "Продажи" })).not.toBeInTheDocument();

    freeView.unmount();
    plan = "start";
    emailCampaignsEnabled = true;
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    expect(screen.getByRole("link", { name: "Рассылки" })).toHaveAttribute("href", "/mailing/app?tab=overview");
    expect(screen.queryByRole("link", { name: "Продажи" })).not.toBeInTheDocument();
  });
});
