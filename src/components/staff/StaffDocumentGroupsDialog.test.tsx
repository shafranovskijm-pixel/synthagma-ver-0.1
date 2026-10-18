import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDocumentGroupsDialog } from "./StaffDocumentGroupsDialog";
const { rpc, success } = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success } }));
const scope = { staff_id: "staff", organization_id: "org", revision: 0, scope: "assigned_groups", group_ids: [], available_groups: [{ id: "group", name: "Группа А" }] };
const row = { id: "staff", organization_id: "org", role: "teacher", sections_access: ["courses.read"] };
const props = { organizationId: "org", staff: { id: "staff", display_name: "Преподаватель" }, canWrite: true, canGrantSign: true, canGrantIssue: true, onClose: vi.fn() };
describe("staff access dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockImplementation(async (name: string) => ({ data: name === "get_org_staff_document_scope" ? scope : row, error: null }));
  });
  it("explains empty scope and saves groups independently of rights", async () => {
    render(<StaffDocumentGroupsDialog {...props} />);
    expect(await screen.findByText(/Без назначенных групп/)).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Группа А" }));
    rpc.mockImplementation(async (name: string) => ({ data: name === "set_org_staff_document_groups" ? { ...scope, revision: 1, group_ids: ["group"] } : row, error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить группы" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Группы сотрудника сохранены"));
    expect(rpc).toHaveBeenCalledWith("set_org_staff_document_groups", expect.objectContaining({ p_group_ids: ["group"] }));
    expect(rpc.mock.calls.some(([name]) => name === "set_org_staff_document_grants")).toBe(false);
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("shows a failed save and never closes or claims success", async () => {
    render(<StaffDocumentGroupsDialog {...props} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Подписывать от организации" }));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить права" }));
    expect(await screen.findByText(/Роль или права изменились/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Сохранить права" })).toBeDisabled();
    expect(success).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  });
  it("read-only viewer cannot change assignments or grants", async () => {
    render(<StaffDocumentGroupsDialog {...props} canWrite={false} />);
    await screen.findByRole("checkbox", { name: "Группа А" });
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сохранить права" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить группы" })).not.toBeInTheDocument();
  });
  it("owner/admin defaults are checked and cannot be rewritten as personal grants", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "get_org_staff_document_scope" ? { ...scope, scope: "organization" } : { ...row, role: "admin" }, error: null }));
    render(<StaffDocumentGroupsDialog {...props} />);
    const sign = await screen.findByRole("checkbox", { name: "Подписывать от организации" });
    expect(sign).toBeChecked(); expect(sign).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Выдавать документы об образовании" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Сохранить права" })).not.toBeInTheDocument();
  });
});
