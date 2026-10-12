import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgCrmCardSection } from "../OrgCrmCardSection";

const state = vi.hoisted(() => ({
  permissions: new Set<string>(), loading: false, error: null as string | null,
  plan: { loading: false, error: null as string | null, enabled: true, refresh: vi.fn() },
  access: vi.fn(), panel: vi.fn(),
}));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  can: (permission: string) => state.permissions.has(permission), loading: state.loading, error: state.error,
}) }));
vi.mock("@/hooks/useOrgCrmAccess", () => ({ useOrgCrmAccess: (organizationId: string | null) => {
  state.access(organizationId); return state.plan;
} }));
vi.mock("../OrgCrmContextPanel", () => ({ OrgCrmContextPanel: (props: unknown) => {
  state.panel(props); return <div data-testid="crm-context-panel" />;
} }));
const props = { organizationId: "org-a", entityType: "student" as const, entityId: "student-user-a", entityName: "Ученик" };

beforeEach(() => {
  state.permissions = new Set(["sales.read", "students.read", "companies.read", "documents.read"]);
  state.loading = false; state.error = null;
  state.plan = { loading: false, error: null, enabled: true, refresh: vi.fn() };
  state.access.mockClear(); state.panel.mockClear();
});
afterEach(cleanup);

describe("CRM access inside company and student cards", () => {
  it("mounts the exact student context read-only and passes document permission separately", () => {
    render(<OrgCrmCardSection {...props} />);
    expect(state.panel).toHaveBeenLastCalledWith({ ...props, canWrite: false, canOpenDocuments: true });
    expect(state.access).toHaveBeenLastCalledWith("org-a");
  });
  it("passes write permission only after both source and CRM read access are confirmed", () => {
    state.permissions.add("sales.write"); state.permissions.delete("documents.read");
    render(<OrgCrmCardSection {...props} entityType="company" entityId="company-a" />);
    expect(state.panel).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: "company", entityId: "company-a", canWrite: true, canOpenDocuments: false }));
  });
  it.each(["sales.read", "students.read"])("does not query or mount student CRM without %s", permission => {
    state.permissions.delete(permission);
    render(<OrgCrmCardSection {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Нет доступа");
    expect(state.access).toHaveBeenLastCalledWith(null); expect(state.panel).not.toHaveBeenCalled();
  });
  it("does not grant company CRM based only on students.read", () => {
    state.permissions.delete("companies.read");
    render(<OrgCrmCardSection {...props} entityType="company" />);
    expect(state.access).toHaveBeenLastCalledWith(null); expect(state.panel).not.toHaveBeenCalled();
  });
  it.each(["loading", "error"])("fails closed when staff permissions are %s", mode => {
    state.loading = mode === "loading"; state.error = mode === "error" ? "offline" : null;
    render(<OrgCrmCardSection {...props} />);
    expect(state.access).toHaveBeenLastCalledWith(null); expect(state.panel).not.toHaveBeenCalled();
    expect(screen.getByRole(mode === "loading" ? "status" : "alert")).toBeInTheDocument();
  });
  it("waits for the tariff before mounting even for write-capable staff", () => {
    state.permissions.add("sales.write"); state.plan.loading = true;
    render(<OrgCrmCardSection {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("по тарифу"); expect(state.panel).not.toHaveBeenCalled();
  });
  it("shows a retry for an unconfirmed tariff instead of claiming the plan is free", () => {
    state.plan.error = "Не удалось проверить тариф";
    render(<OrgCrmCardSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }));
    expect(state.plan.refresh).toHaveBeenCalledOnce(); expect(state.panel).not.toHaveBeenCalled();
    expect(screen.queryByText(/с тарифа/)).not.toBeInTheDocument();
  });
  it("keeps an excluded plan locked without mounting the data panel", () => {
    state.plan.enabled = false;
    render(<OrgCrmCardSection {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Стандарт"); expect(state.panel).not.toHaveBeenCalled();
  });
});
