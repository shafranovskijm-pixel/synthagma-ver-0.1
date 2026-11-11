import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LaborSafetyManager } from "@/components/organization/LaborSafetyManager";
import { fetchLaborSafetyGroups } from "@/api/laborSafetyGroups";

vi.mock("@/api/laborSafetyGroups", () => ({ fetchLaborSafetyGroups: vi.fn() }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: vi.fn() }));
vi.mock("@/hooks/useWordDocumentGenerator", () => ({
  useWordDocumentGenerator: () => ({ generateDocument: vi.fn(), isGenerating: false }),
}));
vi.mock("@/components/organization/LaborSafetyStudentDetailCard", () => ({ LaborSafetyStudentDetailCard: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    if (table !== "labor_safety_records") throw new Error(`Unexpected table: ${table}`);
    const builder = { select: () => builder, eq: () => builder, order: () => Promise.resolve({ data: [], error: null }) };
    return builder;
  } },
}));

const group = {
  id: "group-a", name: "Рабочая группа", organization_id: "org-a",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};
beforeEach(() => {
  vi.mocked(fetchLaborSafetyGroups).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("labor safety group list", () => {
  it("shows a recoverable load failure instead of inviting users to create their first group", async () => {
    vi.mocked(fetchLaborSafetyGroups)
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ groups: [{ ...group, records_count: 2 }], countsUnavailable: false, countsError: null });
    render(<LaborSafetyManager organizationId="org-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить группы");
    expect(screen.queryByRole("button", { name: "Создать первую группу" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByRole("heading", { name: "Рабочая группа" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchLaborSafetyGroups).toHaveBeenCalledTimes(2);
  });

  it("shows unknown counts and keeps groups openable while disabling count sorting", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockResolvedValue({
      groups: [group], countsUnavailable: true, countsError: new Error("count query failed"),
    });
    render(<LaborSafetyManager organizationId="org-a" />);
    const heading = await screen.findByRole("heading", { name: "Рабочая группа" });
    expect(screen.getByRole("status")).toHaveTextContent("Группы можно открывать");
    expect(screen.getByLabelText("Количество записей недоступно")).toHaveTextContent("—");
    expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "По кол-ву записей" })).toBeDisabled();
    fireEvent.click(heading);
    expect(await screen.findByRole("button", { name: "Добавить запись" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers the first-group action after a confirmed successful empty response", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockResolvedValue({ groups: [], countsUnavailable: false, countsError: null });
    render(<LaborSafetyManager organizationId="org-a" />);
    expect(await screen.findByRole("button", { name: "Создать первую группу" })).toBeEnabled();
    expect(screen.getByText(/^0 групп/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).not.toBeInTheDocument();
  });
});
