import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsKpiDashboard } from "../DocumentsKpiDashboard";
import { RecycleBinManager } from "../RecycleBinManager";
import { FrdoReadinessBanner } from "../FrdoReadinessBanner";
const m = vi.hoisted(() => ({ teacher: true, owner: false, loading: false, kpi: vi.fn(), recycle: vi.fn(), readiness: vi.fn() }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ orgRole: m.teacher ? "teacher" : "admin", isOrgOwner: m.owner, loading: m.loading, can: () => true }) }));
vi.mock("@/hooks/useDocumentsKpi", () => ({ useDocumentsKpi: m.kpi }));
vi.mock("@/hooks/useRecycleBin", () => ({ useRecycleBin: m.recycle }));
vi.mock("@/hooks/useFrdoReadiness", () => ({ useFrdoReadiness: m.readiness }));
describe("assigned teacher document overview", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.teacher = true; m.owner = false; m.loading = false;
    m.kpi.mockReturnValue({ kpi: null, loading: false });
    m.recycle.mockReturnValue({ items: [], total: 0, loading: false, search: "", setSearch: vi.fn() });
    m.readiness.mockReturnValue({ stats: { total_documents: 0 }, loading: false, readinessPercent: 0 });
  });
  it.each([DocumentsKpiDashboard, RecycleBinManager, FrdoReadinessBanner])("does not request organization aggregates or invent completeness for a scoped teacher", Component => {
    render(<Component organizationId="org" />);
    expect(screen.getByText("Документы учеников доступны в назначенных вам группах.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Перейти к группам" })).toHaveAttribute("href", "/organization?tab=students&studentsView=groups");
    expect(m.kpi).not.toHaveBeenCalled(); expect(m.recycle).not.toHaveBeenCalled(); expect(m.readiness).not.toHaveBeenCalled();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });
  it("waits for role resolution before any organization-wide request", () => {
    m.loading = true;
    render(<><DocumentsKpiDashboard organizationId="org" /><RecycleBinManager organizationId="org" /><FrdoReadinessBanner organizationId="org" /></>);
    expect(m.kpi).not.toHaveBeenCalled(); expect(m.recycle).not.toHaveBeenCalled(); expect(m.readiness).not.toHaveBeenCalled();
  });
  it("keeps owner aggregate behavior", () => {
    m.owner = true;
    render(<><DocumentsKpiDashboard organizationId="org" /><RecycleBinManager organizationId="org" /><FrdoReadinessBanner organizationId="org" /></>);
    expect(m.kpi).toHaveBeenCalledWith("org"); expect(m.recycle).toHaveBeenCalledWith("org"); expect(m.readiness).toHaveBeenCalledWith("org");
  });
  it("does not promise a thirty-day removal when cleanup is paused", () => {
    m.teacher = false;
    m.recycle.mockReturnValue({ items: [{ id: "d", source_table: "org_documents", organization_id: "org", display_name: "Старый документ", type_label: "Акт", deleted_at: "2025-01-01" }], total: 1, loading: false, search: "", setSearch: vi.fn() });
    render(<RecycleBinManager organizationId="org" />);
    expect(screen.getByText(/Автоматическая очистка приостановлена/)).toBeVisible();
    expect(screen.queryByText(/Удалится через/)).not.toBeInTheDocument();
  });
});
