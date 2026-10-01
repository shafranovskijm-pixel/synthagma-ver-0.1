import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentDepartmentEditor } from "../StudentDepartmentEditor";

const permissions = vi.hoisted(() => ({ write: true, loading: false }));
vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({ can: () => permissions.write, loading: permissions.loading }),
}));

describe("student department editor", () => {
  beforeEach(() => { permissions.write = true; permissions.loading = false; });

  it("lets an operator set an old student's department with an explicit save", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<StudentDepartmentEditor value="" saving={false} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Подразделение"), { target: { value: "Цех 1" } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить подразделение" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("Цех 1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can clear an existing value and cancel a draft without saving", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<StudentDepartmentEditor value="Цех 1" saving={false} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Подразделение"), { target: { value: "Цех 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByLabelText("Подразделение")).toHaveValue("Цех 1");
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Подразделение"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить подразделение" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(""));
  });

  it.each(["readonly", "loading"])("shows the value but prevents edits while %s", (mode) => {
    permissions.write = mode !== "readonly";
    permissions.loading = mode === "loading";
    render(<StudentDepartmentEditor value="Цех 1" saving={false} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Подразделение")).toHaveValue("Цех 1");
    expect(screen.getByLabelText("Подразделение")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сохранить подразделение" })).not.toBeInTheDocument();
  });

  it("keeps the draft and offers a retry after a failed save", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<StudentDepartmentEditor value="Цех 1" saving={false} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Подразделение"), { target: { value: "Цех 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить подразделение" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("не сохранено");
    expect(screen.getByLabelText("Подразделение")).toHaveValue("Цех 2");
    expect(screen.getByRole("button", { name: "Сохранить подразделение" })).toBeEnabled();
  });
});
