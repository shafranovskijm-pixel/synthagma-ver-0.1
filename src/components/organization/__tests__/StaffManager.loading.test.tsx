import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    let org = "";
    const query = {
      select: () => query,
      eq: (_key: string, value: string) => { org = value; return query; },
      order: () => mocks.load(org),
    };
    return query;
  },
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/staff/StaffInvitationDialog", () => ({ StaffInvitationDialog: () => null }));
vi.mock("@/components/staff/RoleAuditLog", () => ({ RoleAuditLog: () => null }));
vi.mock("@/components/staff/PermissionMatrix", () => ({ OrgPermissionMatrix: () => null }));
vi.mock("@/components/staff/OrgCustomRolesManager", () => ({ OrgCustomRolesManager: () => null }));
vi.mock("@/components/staff/StaffExpirationButton", () => ({ StaffExpirationButton: () => null }));
vi.mock("@/components/staff/OwnershipTransfer", () => ({ OwnershipTransfer: () => null }));

import { StaffManager } from "../StaffManager";

const staff = (id: string, name: string) => ({ id, user_id: id, role: "teacher", display_name: name, visibility: "all", expires_at: null });
beforeEach(() => { mocks.load.mockReset(); });
afterEach(cleanup);

describe("StaffManager loading", () => {
  it("does not present a query failure as an empty staff list and allows retry", async () => {
    mocks.load.mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValueOnce({ data: [staff("s1", "Тестовый сотрудник")], error: null });
    render(<StaffManager organizationId="org-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить сотрудников");
    expect(screen.queryByText("Нет сотрудников")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText("Тестовый сотрудник")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.load.mock.calls.map(call => call[0])).toEqual(["org-1", "org-1"]);
  });

  it("keeps the new organization roster when the previous request finishes late", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ data: [staff("new", "Новая организация")], error: null });
    const view = render(<StaffManager organizationId="old-org" />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith("old-org"));
    view.rerender(<StaffManager organizationId="new-org" />);
    expect(await screen.findByText("Новая организация")).toBeVisible();
    await act(async () => resolveOld({ data: [staff("old", "Старая организация")], error: null }));
    expect(screen.queryByText("Старая организация")).not.toBeInTheDocument();
    expect(screen.getByText("Новая организация")).toBeVisible();
  });
});
