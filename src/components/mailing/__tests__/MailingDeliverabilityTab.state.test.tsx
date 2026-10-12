import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailingDeliverabilityTab } from "../MailingDeliverabilityTab";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), invoke: vi.fn(), rpc: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning, info: mocks.info } }));
vi.mock("@/components/admin/broadcast/DomainReputationCheck", () => ({ DomainReputationCheck: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let org = "";
    const query = {
      select: () => query, order: () => query, gte: () => query, limit: () => query,
      eq: (field: string, value: string) => { if (field === "organization_id") org = value; return query; },
      insert: () => query, update: () => query, single: () => mocks.save(),
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => Promise.resolve(mocks.load(table, org)).then(resolve, reject),
    };
    return query;
  },
  functions: { invoke: mocks.invoke }, rpc: mocks.rpc,
} }));

const sender = { id: "sender-a", label: "Почта организации A", from_email: "sender@example.org",
  smtp_status: "ok", is_active: true, warmup_enabled: true, warmup_daily_target: 4,
  warmup_last_run_at: null, warmup_paused_reason: null };
const result = (data: unknown) => ({ data, error: null });
function currentRows(table: string, org: string) {
  return table === "mailing_senders" ? [{ ...sender, ...(org === "org-b" ? { id: "sender-b", label: "Почта организации B" } : {}) }] : [];
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, promise };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockImplementation(async (table, org) => result(currentRows(table, org)));
  mocks.rpc.mockResolvedValue(result(null));
  mocks.save.mockResolvedValue(result({ id: "seed-a" }));
});
afterEach(cleanup);

describe("deliverability load and result states", () => {
  it("shows failed reads as an error, hides fabricated empty data and retries", async () => {
    let fail = true;
    mocks.load.mockImplementation(async (table, org) => fail && table === "mailing_senders"
      ? { data: null, error: { code: "42501" } } : result(currentRows(table, org)));
    render(<MailingDeliverabilityTab organizationId="org-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить данные прогрева");
    expect(screen.queryByText("Сначала добавьте и проверьте SMTP-отправителя.")).not.toBeInTheDocument();
    expect(screen.queryByText("Контрольных отправок пока не было.")).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByText(sender.label)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    { payload: { sent: 0, failed: 1, checked: 0, error_categories: ["smtp:auth"] }, level: "error", text: "завершилась с ошибками" },
    { payload: { sent: 0, failed: 0, checked: 2, error_categories: [] }, level: "success", text: "Проверено ранее отправленных писем: 2" },
    { payload: { sent: 0, failed: 0, checked: 0, error_categories: [] }, level: "info", text: "Новых отправок и результатов проверки нет" },
    { payload: null, level: "error", text: "Не удалось подтвердить результат проверки" },
  ] as const)("reports the actual worker result: $text", async ({ payload, level, text }) => {
    mocks.invoke.mockResolvedValue(result(payload));
    render(<MailingDeliverabilityTab organizationId="org-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Проверить сейчас" }));
    await waitFor(() => expect(mocks[level]).toHaveBeenCalledWith(expect.stringContaining(text)));
    if (level !== "success") expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalledWith(expect.stringContaining("дневной лимит уже выполнен"));
  });

  it("ignores a delayed read from the previous organization", async () => {
    const oldRead = deferred();
    mocks.load.mockImplementation((table, org) => table === "mailing_senders" && org === "org-a"
      ? oldRead.promise : Promise.resolve(result(currentRows(table, org))));
    const { rerender } = render(<MailingDeliverabilityTab organizationId="org-a" />);
    rerender(<MailingDeliverabilityTab organizationId="org-b" />);
    expect(await screen.findByText("Почта организации B")).toBeInTheDocument();
    await act(async () => { oldRead.resolve(result([sender])); });
    expect(screen.queryByText(sender.label)).not.toBeInTheDocument();
    expect(screen.getByText("Почта организации B")).toBeInTheDocument();
  });

  it("does not reload the old organization or toast after its pending action finishes", async () => {
    const oldRun = deferred();
    mocks.invoke.mockReturnValue(oldRun.promise);
    const { rerender } = render(<MailingDeliverabilityTab organizationId="org-a" />);
    fireEvent.click(await screen.findByRole("button", { name: "Проверить сейчас" }));
    rerender(<MailingDeliverabilityTab organizationId="org-b" />);
    await act(async () => { oldRun.resolve(result({ sent: 1, failed: 0, checked: 0, error_categories: [] })); });
    expect(await screen.findByText("Почта организации B")).toBeInTheDocument();
    expect(mocks.load.mock.calls.filter(([, org]) => org === "org-a")).toHaveLength(3);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("clears the seed password and stops the follow-up IMAP test on organization change", async () => {
    const oldSave = deferred();
    mocks.save.mockReturnValue(oldSave.promise);
    const { rerender } = render(<MailingDeliverabilityTab organizationId="org-a" />);
    await screen.findByText(sender.label);
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    fireEvent.change(screen.getByPlaceholderText("control@example.com"), { target: { value: "control@gmail.com" } });
    fireEvent.change(screen.getByRole("dialog").querySelector('input[type="password"]')!, { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и проверить" }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    rerender(<MailingDeliverabilityTab organizationId="org-b" />);
    await act(async () => { oldSave.resolve(result({ id: "seed-a" })); });
    expect(await screen.findByText("Почта организации B")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByRole("dialog").querySelector('input[type="password"]')).toHaveValue("");
  });
});
