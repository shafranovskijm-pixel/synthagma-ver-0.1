import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddStudentsToGroupsDialog } from "@/components/organization/groups/AddStudentsToGroupsDialog";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const groups = [{ id: "g1", name: "Первое обучение" }, { id: "g2", name: "Второе обучение" }];

describe("adding existing students to multiple groups", () => {
  beforeEach(() => vi.clearAllMocks());
  it("adds both selected students to both groups in one atomic operation", async () => {
    const onSaved = vi.fn(); const onOpenChange = vi.fn();
    mocks.rpc.mockResolvedValue({ data: groups.flatMap(group => ["u1", "u2"].map(user_id => ({ organization_id: "org", group_id: group.id, user_id }))), error: null });
    render(<AddStudentsToGroupsDialog open organizationId="org" userIds={["u1", "u2"]} groups={groups} onSaved={onSaved} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByLabelText("Добавить в Первое обучение"));
    fireEvent.click(screen.getByLabelText("Добавить в Второе обучение"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить в выбранные группы" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("add_students_to_groups", { p_organization_id: "org", p_user_ids: ["u1", "u2"], p_group_ids: ["g1", "g2"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps selections open and reports no success after an incomplete response", async () => {
    const onSaved = vi.fn(); const onOpenChange = vi.fn();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    render(<AddStudentsToGroupsDialog open organizationId="org" userIds={["u1"]} groups={groups} onSaved={onSaved} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByLabelText("Добавить в Первое обучение"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить в выбранные группы" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
