import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationHomeTab } from "./OrganizationHomeTab";
const org = "11111111-1111-4111-8111-111111111111";
const api = vi.hoisted(() => ({ getRtnUpdateSummary: vi.fn() }));
vi.mock("@/api/rtn-updates", () => api);
let readable = true;
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({ user: { id: "actor-a" }, organizationId: org, organizationName: "Тестовый центр", branding: { brandingSettings: {} }, subscriptionLimits: { plan: "professional", accessReady: true, limits: {}, canCreateCourse: true }, tabNavigation: { setActiveTab: vi.fn() }, courses: [], isLoadingCourses: false, stats: {}, hasSummaryData: true, isSummaryLoading: false }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ loading: false, canSeeOrgTab: (tab: string) => readable && tab === "courses", can: (permission: string) => readable && permission.startsWith("courses.") }) }));
vi.mock("@/components/organization/QuickStartCard", () => ({ QuickStartCard: () => <section aria-label="Быстрый старт" /> }));
vi.mock("./StatsCards", () => ({ StatsCards: () => null }));
beforeEach(() => { readable = true; api.getRtnUpdateSummary.mockReset(); api.getRtnUpdateSummary.mockResolvedValue({ event_count: 0, latest_event: null, count_is_lower_bound: false, count_semantics: "known_events_not_unread", source_health: { status: "never_checked", coverage_kind: "unknown", last_success_at: null } }); });
afterEach(cleanup);
describe("RTN home integration", () => {
  it("places the compact source status after primary daily actions and before secondary sections", async () => {
    render(<MemoryRouter><OrganizationHomeTab /></MemoryRouter>);
    const card = await screen.findByRole("region", { name: "Ростехнадзор на рабочем столе" });
    const primary = screen.getByRole("button", { name: "Создать курс" });
    const quickStart = screen.getByRole("region", { name: "Быстрый старт" });
    expect(primary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(card.compareDocumentPosition(quickStart) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(api.getRtnUpdateSummary).toHaveBeenCalledWith(org);
  });
  it("does not request or promote the RTN summary without readable courses", () => {
    readable = false;
    render(<MemoryRouter><OrganizationHomeTab /></MemoryRouter>);
    expect(api.getRtnUpdateSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Ростехнадзор на рабочем столе" })).not.toBeInTheDocument();
  });
});
