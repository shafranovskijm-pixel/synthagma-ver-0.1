import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const testState = vi.hoisted(() => ({
  coverUrl: "",
  coverPosition: "cover",
  setActiveTab: vi.fn(),
  proxiedAssetUrl: vi.fn(),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    organizationName: "СГТ",
    branding: { brandingSettings: { customName: "", logoUrl: "", coverUrl: testState.coverUrl, coverPosition: testState.coverPosition } },
    tabNavigation: { activeTab: "home", setActiveTab: testState.setActiveTab },
    subscriptionLimits: { plan: "start" },
    user: { email: "admin@example.test" },
    setIsMobileSidebarOpen: vi.fn(),
    handleLogout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useOrgNewIndicators", () => ({ useOrgNewIndicators: () => ({ whatsNew: 0 }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/organization/OrgNotifications", () => ({ OrgNotifications: () => null }));
vi.mock("@/components/organization/QuickActionChips", () => ({ QuickActionChips: () => null }));
vi.mock("@/components/organization/SectionBreadcrumbDropdown", () => ({ SectionBreadcrumbDropdown: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock("@/components/shared/AnnouncementsBell", () => ({ AnnouncementsBell: () => null }));
vi.mock("@/components/radio/RadioPlayerButton", () => ({ RadioPlayerButton: () => null }));
vi.mock("@/components/account/AccountSettingsLink", () => ({ AccountSettingsMenuItem: () => null }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: testState.proxiedAssetUrl }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {}, error: null }) }) }) }) },
}));

import { OrgDashboardHeader } from "@/components/organization/OrgDashboardHeader";

const COVER_URL = "https://storage.example.test/org/cover.png";
const PROXIED_COVER_URL = "https://api.example.test/sb-storage/object/public/org-branding/org/cover.png";

function renderHeader() {
  return render(<MemoryRouter><TooltipProvider><OrgDashboardHeader /></TooltipProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.coverUrl = "";
  testState.coverPosition = "cover";
  testState.proxiedAssetUrl.mockImplementation((url: string) => url === COVER_URL ? PROXIED_COVER_URL : url || "");
});

afterEach(cleanup);

describe("organization dashboard cover", () => {
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
