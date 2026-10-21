import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { applySharedTheme, restorePersonalTheme, DEFAULT_THEME_PREFERENCES } from "@/lib/themePreferences";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const infoToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { info: infoToast, error: errorToast, success: vi.fn() } }));
const setActiveTab = vi.fn();
const setTheme = vi.fn();
let pinnedIds: string[] = [];
let allowedTabs = new Set<string>();
let menuSettings: Record<string, boolean> = {};
let plan = "standard";
let isPostpaid = false;
let emailCampaignsEnabled = true;
let salesCrmEnabled = true;
let activeTab = "home";
let isMobile = false;
let isMobileSidebarOpen = false;
let permissionsLoading = false;
let subscriptionLoading = false;
let subscriptionError: string | null = null;
let organizationId: string | null = "org-1";
let organizationLoading = false;
let subscriptionReady = true;
const retryFeatureAccess = vi.fn();
let featureAccess = { ready: true, loading: false, error: null as string | null, refetch: retryFeatureAccess };
let featuresEnabled = true;

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId,
    isLoadingCourses: organizationLoading,
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
      isPostpaid,
      loading: subscriptionLoading,
      accessReady: subscriptionReady && !subscriptionLoading && !subscriptionError,
      error: subscriptionError,
      limits: { emailCampaignsEnabled, salesCrmEnabled },
    },
    crmAccess: { enabled: salesCrmEnabled, loading: false, error: null },
    dashboardSettings: { menuSettings },
    featureAccess,
    isEnabled: () => featuresEnabled,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen: vi.fn(),
    handleLogout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionsLoading,
    can: (permission: string) => permission === "sales.read" && allowedTabs.has("sales"),
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

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => isMobile }));
vi.mock("@/hooks/useDrivingSchoolEntry", () => ({ useDrivingSchoolEntry: () => false }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme }),
}));

import { OrgMobileBottomNav } from "@/components/organization/OrgMobileBottomNav";
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

function renderMobileBottomNav() {
  return render(<OrgMobileBottomNav />);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("org-sidebar-mode", "expanded");
  setActiveTab.mockClear();
  infoToast.mockClear(); errorToast.mockClear(); retryFeatureAccess.mockClear();
  featureAccess = { ready: true, loading: false, error: null, refetch: retryFeatureAccess }; featuresEnabled = true;
  setTheme.mockClear();
  pinnedIds = [];
  plan = "standard";
  isPostpaid = false;
  emailCampaignsEnabled = true;
  salesCrmEnabled = true;
  activeTab = "home";
  isMobile = false;
  isMobileSidebarOpen = false;
  permissionsLoading = false;
  subscriptionLoading = false;
  subscriptionError = null;
  organizationId = "org-1";
  organizationLoading = false;
  subscriptionReady = true;
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
    "mailing",
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
  it("keeps other locked navigation neutral instead of quoting an unverified tariff", () => {
    subscriptionReady = false; salesCrmEnabled = false;
    renderSidebar();
    fireEvent.click(screen.getByLabelText("CRM"));
    expect(infoToast).toHaveBeenCalledWith("Условия не подтверждены");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("does not treat a null-organization free fallback as a verified tariff or upgrade", () => {
    organizationId = null; organizationLoading = true; subscriptionReady = false;
    plan = "free"; emailCampaignsEnabled = false;
    renderSidebar();
    expect(screen.getByText("Кабинет загружается…")).toBeInTheDocument();
    expect(screen.getByText("Проверяем условия…")).toBeInTheDocument();
    expect(screen.queryByText("Бесплатный тариф")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    fireEvent.click(screen.getByLabelText("Рассылки"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it.each(["unverified", "error"])("uses canonical accessReady instead of a free fallback while %s", mode => {
    subscriptionReady = false; plan = "free"; emailCampaignsEnabled = false;
    if (mode === "error") subscriptionError = "unconfirmed";
    renderSidebar();
    expect(screen.getByText("Условия не подтверждены")).toBeInTheDocument();
    expect(screen.queryByText("Бесплатный тариф")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    fireEvent.click(screen.getByLabelText("Рассылки"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("keeps a missing organization neutral after resolution stops loading", () => {
    organizationId = null; subscriptionReady = false; plan = "free";
    renderSidebar();
    expect(screen.getByText("Кабинет организации")).toBeInTheDocument();
    expect(screen.getByText("Условия не подтверждены")).toBeInTheDocument();
    expect(screen.queryByText("Учебный центр")).not.toBeInTheDocument();
  });
  it("transitions from initial context through billing verification to confirmed postpayment", () => {
    organizationId = null; organizationLoading = true; subscriptionReady = false; plan = "free";
    const view = renderSidebar();
    expect(screen.queryByText("Бесплатный тариф")).not.toBeInTheDocument();
    organizationId = "org-1"; subscriptionLoading = true;
    view.rerender(<MemoryRouter><TooltipProvider><OrgSidebar /></TooltipProvider></MemoryRouter>);
    expect(screen.getByText("Проверяем условия…")).toBeInTheDocument();
    organizationLoading = false; subscriptionLoading = false; subscriptionReady = true; isPostpaid = true;
    view.rerender(<MemoryRouter><TooltipProvider><OrgSidebar /></TooltipProvider></MemoryRouter>);
    expect(screen.getByText("Постоплата по договору")).toBeInTheDocument();
    expect(screen.queryByText("Проверяем условия…")).not.toBeInTheDocument();
    expect(screen.queryByText("Бесплатный тариф")).not.toBeInTheDocument();
  });
  it("retains the real free tariff and its upgrade only after confirmation", () => {
    plan = "free"; emailCampaignsEnabled = false;
    renderSidebar();
    expect(screen.getByText("Бесплатный тариф")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    fireEvent.click(screen.getByLabelText("Рассылки"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
  it("opens mailing for active postpaid with a free legacy plan", () => {
    plan = "free"; isPostpaid = true;
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    expect(screen.getByRole("link", { name: "Рассылки" })).toHaveAttribute("href", "/organization?tab=mailing&mailingTab=overview");
  });
  it.each(["pending", "error"])("does not present an upgrade for mailing access that is %s", mode => {
    plan = "free"; isPostpaid = true;
    if (mode === "pending") subscriptionLoading = true;
    else subscriptionError = "profile unconfirmed";
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Коммуникации" }));
    fireEvent.click(screen.getByRole("link", { name: "Рассылки" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Недоступно на вашем тарифе")).not.toBeInTheDocument();
  });
  it("shows the current billing mode without changing the stored prepaid plan", () => {
    plan = "maximum";
    const { rerender } = renderSidebar();
    expect(screen.getByText("Максимальный тариф")).toBeInTheDocument();

    isPostpaid = true;
    rerender(<MemoryRouter initialEntries={["/organization"]}><TooltipProvider><OrgSidebar /></TooltipProvider></MemoryRouter>);
    expect(screen.getByText("Постоплата по договору")).toBeInTheDocument();
    expect(screen.queryByText("Максимальный тариф")).not.toBeInTheDocument();

    isPostpaid = false;
    rerender(<MemoryRouter initialEntries={["/organization"]}><TooltipProvider><OrgSidebar /></TooltipProvider></MemoryRouter>);
    expect(screen.getByText("Максимальный тариф")).toBeInTheDocument();
  });

  it("keeps shared appearance locked and restores the personal theme control when enforcement ends", () => {
    applySharedTheme(DEFAULT_THEME_PREFERENCES);
    renderSidebar();
    const control = screen.getByRole("button", { name: "Оформление задаётся организацией" });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(setTheme).not.toHaveBeenCalled();
    act(() => restorePersonalTheme());
    fireEvent.click(screen.getByRole("button", { name: "Сменить тему" }));
    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
  });
  it("opens the CRM beta from its own main item and shows the beta marker", () => {
    activeTab = "sales";
    renderSidebar();
    const link = screen.getByRole("link", { name: "CRM" });
    expect(link).toHaveAttribute("href", "/organization?tab=sales");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(within(link).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    fireEvent.click(link);
    expect(setActiveTab).toHaveBeenCalledWith("sales");
  });

  it.each(["loading", "missing permission"])("does not expose CRM while %s", mode => {
    if (mode === "loading") permissionsLoading = true;
    else allowedTabs.delete("sales");
    renderSidebar();
    expect(screen.queryByLabelText("CRM")).not.toBeInTheDocument();
  });

  it("keeps CRM visible but locked when the existing plan excludes it", () => {
    salesCrmEnabled = false;
    renderSidebar();
    const item = screen.getByLabelText("CRM");
    expect(item).not.toHaveAttribute("href");
    fireEvent.click(item);
    expect(setActiveTab).not.toHaveBeenCalledWith("sales");
    expect(screen.queryByRole("button", { name: "Перейти к тарифам" })).not.toBeInTheDocument();
  });
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

  it("expands the fixed Windows-like sidebar instead of opening a floating card", () => {
    localStorage.setItem("org-sidebar-mode", "icons");
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    fireEvent.click(within(sidebar).getByRole("button", { name: "Ученики" }));
    expect(sidebar).toHaveStyle({ width: "220px" });
    const studentsSection = within(sidebar).getByRole("navigation", { name: "Ученики: подразделы" });
    expect(within(studentsSection).getByRole("link", { name: "Ученики и группы" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    expect(screen.queryByRole("navigation", { name: "Ученики: подразделы" })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole("navigation", { name: "Курсы: подразделы" })).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    expect(screen.queryByRole("navigation", { name: "Курсы: подразделы" })).not.toBeInTheDocument();
  });

  it("expands compact settings inside the fixed sidebar", () => {
    localStorage.setItem("org-sidebar-mode", "compact");
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    const settingsButton = within(sidebar).getByRole("button", { name: "Настройки" });
    fireEvent.click(settingsButton);
    expect(sidebar).toHaveStyle({ width: "220px" });
    const settingsSection = within(sidebar).getByRole("navigation", { name: "Настройки: подразделы" });
    const staffLink = within(settingsSection).getByRole("link", { name: "Сотрудники и доступы" });
    expect(staffLink).toBeInTheDocument();
    expect(settingsButton.compareDocumentPosition(staffLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not auto-open an active compact section over the workspace", () => {
    activeTab = "students";
    localStorage.setItem("org-sidebar-mode", "icons");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(sidebar).toHaveStyle({ width: "64px" });
    expect(screen.queryByRole("navigation", { name: "Ученики: подразделы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps every icon-only control on one 44px rail", () => {
    localStorage.setItem("org-sidebar-mode", "icons");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    const controls = [
      within(sidebar).getByRole("link", { name: "Главная" }),
      within(sidebar).getByRole("button", { name: "Курсы" }),
      within(sidebar).getByRole("button", { name: "Ученики" }),
      within(sidebar).getByRole("link", { name: "Компании" }),
      within(sidebar).getByRole("button", { name: "Коммуникации" }),
      within(sidebar).getByRole("button", { name: "Документы" }),
      within(sidebar).getByRole("link", { name: "Отчёты" }),
      within(sidebar).getByRole("button", { name: "Настройки" }),
      within(sidebar).getByRole("link", { name: "Помощь" }),
      within(sidebar).getByRole("button", { name: /Переключить режим меню/ }),
      within(sidebar).getByRole("button", { name: "Выйти" }),
    ];

    controls.forEach((control) => {
      expect(control).toHaveClass("mx-auto", "h-11", "w-11");
      expect(control).not.toHaveClass("mt-1");
    });

    const betaDot = within(within(sidebar).getByRole("link", { name: "Отчёты" }))
      .getByLabelText("Бета-версия");
    expect(betaDot).toHaveClass("-bottom-1", "-right-1", "h-2", "w-2");
    expect(betaDot).toHaveTextContent("Beta");
  });

  it("keeps compact controls on one centered 68px rail", () => {
    localStorage.setItem("org-sidebar-mode", "compact");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    const controls = [
      within(sidebar).getByRole("link", { name: "Главная" }),
      within(sidebar).getByRole("button", { name: "Курсы" }),
      within(sidebar).getByRole("button", { name: "Ученики" }),
      within(sidebar).getByRole("link", { name: "Компании" }),
      within(sidebar).getByRole("button", { name: "Коммуникации" }),
      within(sidebar).getByRole("button", { name: "Документы" }),
      within(sidebar).getByRole("link", { name: "Отчёты" }),
      within(sidebar).getByRole("button", { name: "Настройки" }),
      within(sidebar).getByRole("link", { name: "Помощь" }),
      within(sidebar).getByRole("button", { name: /Переключить режим меню/ }),
      within(sidebar).getByRole("button", { name: "Выйти" }),
    ];

    controls.forEach((control) => {
      expect(control).toHaveClass(
        "mx-auto",
        "grid",
        "h-14",
        "w-[68px]",
        "grid-rows-[18px_20px]",
        "content-center",
        "justify-items-center",
      );
      expect(control).not.toHaveClass("mt-1");
    });
    expect(within(sidebar).getByRole("button", { name: "Настройки" }).parentElement).toHaveClass("items-center");
    expect(within(sidebar).getByRole("button", { name: "Выйти" })).toHaveTextContent("Выйти");

    controls.forEach((control) => {
      const label = control.querySelector("span.line-clamp-2");
      expect(label).toHaveClass("h-5", "w-[64px]", "leading-[10px]");
    });

    const betaDot = within(within(sidebar).getByRole("link", { name: "Отчёты" }))
      .getByLabelText("Бета-версия");
    expect(betaDot).toHaveClass("-bottom-1", "-right-1", "h-2", "w-2");
  });

  it("opens a full-width tablet drawer without overwriting the saved desktop mode", () => {
    localStorage.setItem("org-sidebar-mode", "compact");
    isMobile = false;
    isMobileSidebarOpen = true;

    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(sidebar).toHaveStyle({ width: "220px" });
    expect(within(sidebar).getByText("Учебный центр")).toBeInTheDocument();
    expect(localStorage.getItem("org-sidebar-mode")).toBe("compact");
  });

  it.each([
    ["compact", 88],
    ["icons", 64],
  ] as const)("keeps the mobile drawer expanded without overwriting saved %s desktop mode", (savedMode, desktopWidth) => {
    isMobile = true;
    localStorage.setItem("org-sidebar-mode", savedMode);
    const mobileView = renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(sidebar).toHaveStyle({ width: "220px" });
    expect(sidebar).toHaveClass("bg-background");
    expect(within(sidebar).getByText("Учебный центр")).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));

    expect(within(sidebar).getByRole("navigation", { name: "Курсы: подразделы" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(localStorage.getItem("org-sidebar-mode")).toBe(savedMode);
    mobileView.unmount();

    isMobile = false;
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Основная навигация" })).toHaveStyle({
      width: `${desktopWidth}px`,
    });
  });

  it("hides the mobile bottom bar while the navigation drawer is open", () => {
    isMobileSidebarOpen = true;
    renderMobileBottomNav();

    expect(screen.queryByRole("navigation", { name: "Главное меню" })).not.toBeInTheDocument();
  });

  it("keeps existing workspaces grouped and CRM beta addressable with canonical links", () => {
    renderSidebar();
    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });

    expect(within(sidebar).getByRole("link", { name: "Главная" })).toHaveAttribute("href", "/organization");
    expect(within(sidebar).getByRole("button", { name: "Курсы" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Ученики" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Компании" })).toHaveAttribute("href", "/organization?tab=organizations");
    expect(within(sidebar).getByRole("button", { name: "Коммуникации" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Документы" })).toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "Продажи" })).not.toBeInTheDocument();
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
      "/organization?tab=mailing&mailingTab=overview",
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

  it("marks experimental workspaces as Beta and honours visibility plus permissions", () => {
    menuSettings = { ...menuSettings, showDocuments: false };
    allowedTabs.delete("staff");
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Курсы" }));
    const homeworkLink = within(sidebar).getByRole("link", { name: "Домашние работы" });
    const courseStoreLink = within(sidebar).getByRole("link", { name: "Готовые курсы" });
    expect(within(homeworkLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(courseStoreLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Коммуникации" }));
    const mailingLink = within(sidebar).getByRole("link", { name: "Рассылки" });
    expect(within(mailingLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Документы" }));
    expect(screen.queryByRole("link", { name: "Сводка" })).not.toBeInTheDocument();
    const journalsLink = within(sidebar).getByRole("link", { name: "Журналы" });
    const frdoLink = within(sidebar).getByRole("link", { name: "ФИС ФРДО" });
    expect(within(journalsLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(within(frdoLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");

    const reportsLink = within(sidebar).getByRole("link", { name: "Отчёты" });
    expect(within(reportsLink).getByLabelText("Бета-версия")).toHaveTextContent("Beta");
    expect(screen.queryByRole("link", { name: "Продажи" })).not.toBeInTheDocument();

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

  it("shows locked mailing on Free and enables it on Start without the legacy Sales workspace", () => {
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
    expect(screen.getByRole("link", { name: "Рассылки" })).toHaveAttribute(
      "href",
      "/organization?tab=mailing&mailingTab=overview",
    );
    expect(screen.queryByRole("link", { name: "Продажи" })).not.toBeInTheDocument();
  });

  it("marks the embedded mailing workspace as the active communication destination", () => {
    activeTab = "mailing";
    renderSidebar();

    const sidebar = screen.getByRole("navigation", { name: "Основная навигация" });
    const communications = within(sidebar).getByRole("navigation", {
      name: "Коммуникации: подразделы",
    });
    expect(within(communications).getByRole("link", { name: "Рассылки" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("feature verification never masquerades as a tariff lock", () => {
  it("keeps the selected category through checking, ready, error and retry without an upgrade redirect", () => {
    activeTab = "courses";
    featureAccess = { ready: false, loading: true, error: null, refetch: retryFeatureAccess };
    featuresEnabled = false;
    const view = renderSidebar();
    const tree = () => <MemoryRouter initialEntries={["/organization"]}><TooltipProvider><OrgSidebar /></TooltipProvider></MemoryRouter>;
    const entry = () => screen.getByLabelText("Все курсы");
    expect(entry()).not.toHaveAttribute("href");
    expect(entry()).toHaveAttribute("aria-busy", "true");
    expect(screen.queryAllByTestId("feature-plan-locked")).toHaveLength(0);
    fireEvent.click(entry());
    expect(infoToast).toHaveBeenLastCalledWith("Проверяем доступность функций…");
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    featureAccess = { ...featureAccess, ready: true, loading: false }; featuresEnabled = true;
    view.rerender(tree());
    expect(entry()).toHaveAttribute("href", "/organization?tab=courses");
    expect(screen.queryAllByTestId("feature-access-checking")).toHaveLength(0);
    featureAccess = { ...featureAccess, ready: false, error: "Не удалось проверить доступность функций" }; featuresEnabled = false;
    view.rerender(tree());
    expect(entry()).not.toHaveAttribute("href");
    expect(screen.queryAllByTestId("feature-access-error").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("feature-plan-locked")).toHaveLength(0);
    fireEvent.click(entry());
    expect(errorToast).toHaveBeenCalledWith(featureAccess.error, expect.objectContaining({ action: expect.objectContaining({ label: "Повторить" }) }));
    errorToast.mock.calls.at(-1)![1].action.onClick();
    expect(retryFeatureAccess).toHaveBeenCalledOnce();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    featureAccess = { ...featureAccess, ready: true, error: null }; featuresEnabled = true;
    view.rerender(tree());
    expect(entry()).toHaveAttribute("href", "/organization?tab=courses");
  });
  it("retains a real tariff exclusion after successful feature verification", () => {
    activeTab = "courses"; featuresEnabled = false;
    renderSidebar();
    expect(screen.queryAllByTestId("feature-plan-locked").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Все курсы"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
