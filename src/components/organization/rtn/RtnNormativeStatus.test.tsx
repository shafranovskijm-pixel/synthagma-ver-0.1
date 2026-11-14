import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnNormativeStatus } from "./RtnNormativeStatus";
import type { RtnBank } from "@/types/rostechnadzor";
const api = vi.hoisted(() => ({ checkRtnNormativeBasis: vi.fn() }));
vi.mock("@/api/rtn-npa-staff", () => api);
const bank = {
  id: "bank-a", code: "А.1", release_id: "release-a", normative_status: "current",
  admission_basis: "manual_review", latest_check_status: "unknown", normative_cutoff_at: "2026-11-21T00:00:00+03:00",
} as RtnBank;
function mount(input: { canManage?: boolean; value?: RtnBank; pending?: boolean } = {}) {
  const onQueued = vi.fn(); const refresh = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RtnNormativeStatus organizationId="tenant-a" bank={input.value || bank} canManage={input.canManage ?? true} pending={input.pending ?? false} onQueued={onQueued} refresh={refresh} /></QueryClientProvider>);
  return { onQueued, refresh };
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe("normative check without editorial authority", () => {
  it("keeps the server's remaining manual window while clearly reporting unknown automatic currency", () => {
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Актуальность не удалось подтвердить");
    expect(screen.getByText(/Действует срок предметной проверки/)).toHaveTextContent("21.11.2026, 00:00 МСК (не включительно)");
    expect(screen.queryByText(/подтверждённых изменений нет/)).not.toBeInTheDocument();
  });
  it("does not convert a queue receipt into successful currency or alter admission", async () => {
    api.checkRtnNormativeBasis.mockResolvedValue({ run_id: "run-a", status: "queued" });
    const mounted = mount();
    fireEvent.click(screen.getByRole("button", { name: "Проверить нормативные основания" }));
    await waitFor(() => expect(mounted.onQueued).toHaveBeenCalledTimes(1));
    expect(api.checkRtnNormativeBasis).toHaveBeenCalledExactlyOnceWith("tenant-a", "bank-a");
    expect(screen.getByRole("status")).toHaveTextContent("Актуальность не удалось подтвердить");
    expect(screen.queryByText(/Допуск подтверждён автоматической/)).not.toBeInTheDocument();
  });
  it("allows a reader to refresh status but not queue work", () => {
    const mounted = mount({ canManage: false });
    expect(screen.getByRole("button", { name: "Проверить нормативные основания" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Обновить результат проверки" }));
    expect(mounted.refresh).toHaveBeenCalledTimes(1);
    expect(api.checkRtnNormativeBasis).not.toHaveBeenCalled();
  });
  it("does not silently retry after a lost reply or claim a successful check", async () => {
    api.checkRtnNormativeBasis.mockRejectedValue(new Error("Запрос мог уже попасть в очередь"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Проверить нормативные основания" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Запрос мог уже попасть в очередь");
    expect(api.checkRtnNormativeBasis).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Актуальность не удалось подтвердить");
  });
  it("closes the new action while the foundation schema has not installed the normative projection", () => {
    mount({ value: { ...bank, admission_basis: undefined, latest_check_status: undefined } });
    expect(screen.getByRole("status")).toHaveTextContent("подключается");
    expect(screen.getByRole("button", { name: "Проверить нормативные основания" })).toBeDisabled();
  });
  it("keeps active work pending without assigning a successful label", () => {
    mount({ pending: true });
    expect(screen.getByRole("button", { name: "Проверить нормативные основания" })).toBeDisabled();
    expect(screen.getByText(/Запрос принят/)).toHaveTextContent("актуальность ещё не подтверждена");
  });
});
