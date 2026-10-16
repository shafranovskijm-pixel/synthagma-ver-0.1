import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgPostpaidBillingPanel } from "./OrgPostpaidBillingPanel";
import type { PostpaidAgreement, PostpaidOverview, PostpaidStatement } from "@/hooks/useOrgPostpaidBilling";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
const agreement = (org = "org-a"): PostpaidAgreement => ({ id: "agreement", organization_id: org, effective_from: "2026-10-01", effective_to: null, contract_reference: "Договор 12 от 01.10.2026", customer_confirmation: "Подписан директором", terms_version: "2026-10", recording_started_at: "2026-10-16T00:00:00Z", contract_through: "2026-12-31", annual_renewal: true });
const statement = (patch: Partial<PostpaidStatement> = {}): PostpaidStatement => ({ id: "statement-a", organization_id: "org-a", period_start: "2026-10-01", period_end: "2026-11-01", revision: 1, status: "needs_review", plan: "start", amount: 4490, snapshot: { courses_count: 1, learners_count: 2, ledger_courses_count: 1, ledger_learners_count: 2, features: { crm: false, webinar: false, videoserviceplus: false, frdoplus: false }, completeness: { status: "requires_manual_review", reasons: ["recording_started_after_period_start"] }, access_days: 31, month_days: 31, period_closed: true }, review_note: null, reviewed_courses: null, reviewed_learners: null, invoice_id: null, ...patch });
let overview: PostpaidOverview;
let prepared: PostpaidStatement;
function setup(org = "org-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><OrgPostpaidBillingPanel organizationId={org} /></QueryClientProvider>);
  return { ...view, switchOrg: (id: string) => view.rerender(<QueryClientProvider client={client}><OrgPostpaidBillingPanel organizationId={id} /></QueryClientProvider>) };
}
async function prepare() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Подготовить расчёт" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Подготовить расчёт" }));
  await screen.findByText("Тариф и сумма — после ручной сверки");
}
function fillReview() {
  fireEvent.change(screen.getByLabelText("Курсы за месяц после сверки"), { target: { value: "16" } });
  fireEvent.change(screen.getByLabelText("Уникальные обучавшиеся после сверки"), { target: { value: "101" } });
  fireEvent.change(screen.getByLabelText("Основание проверки расчёта"), { target: { value: "Сверено с журналом за октябрь, документ 17" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Проверены период, фактическое использование и согласованные условия" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  overview = { agreement: agreement(), statements: [], feature_confirmations: [], feature_usage: [] };
  prepared = statement();
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, any>) => {
    if (name === "get_postpaid_billing_overview") return { data: args.p_organization_id === "org-a" ? overview : { agreement: null, statements: [], feature_confirmations: [], feature_usage: [] }, error: null };
    if (name === "prepare_postpaid_statement") { overview = { ...overview, statements: [prepared] }; return { data: prepared, error: null }; }
    if (name === "approve_postpaid_statement") {
      prepared = { ...prepared, status: "approved", plan: "standard", amount: 6990, review_note: args.p_review_note, reviewed_courses: args.p_courses_override, reviewed_learners: args.p_learners_override };
      overview = { ...overview, statements: [prepared] };
      return { data: prepared, error: null };
    }
    if (name === "issue_postpaid_invoice") { prepared = { ...prepared, status: "invoiced", invoice_id: "invoice-a" }; overview = { ...overview, statements: [prepared] }; return { data: { invoice_id: "invoice-a", statement_id: args.p_statement_id, already_issued: false }, error: null }; }
    throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("postpaid billing review and invoice flow", () => {
  it("does not activate postpaid on mount and saves only the selected organization's evidenced agreement", async () => {
    overview.agreement = null;
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, args) => {
      if (name === "save_postpaid_agreement") { overview.agreement = { ...agreement(), contract_reference: args.p_contract_reference, customer_confirmation: args.p_customer_confirmation }; return { data: overview.agreement, error: null }; }
      return original(name, args);
    });
    setup();
    const button = await screen.findByRole("button", { name: "Подключить постоплату" });
    expect(button).toBeDisabled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["get_postpaid_billing_overview"]);
    fireEvent.change(screen.getByLabelText("Договор / основание"), { target: { value: "Договор №7 от 01.10.2026" } });
    fireEvent.change(screen.getByLabelText("Подтверждение клиента"), { target: { value: "Подписанное приложение, архив №8" } });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Проверены договор и полученное согласие клиента на эти условия" }));
    fireEvent.change(screen.getByLabelText("Начало доступа по постоплате"), { target: { value: "2026-10-16" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Начало доступа по постоплате"), { target: { value: "2026-10-01" } });
    fireEvent.click(button);
    await screen.findByText("Условия постоплаты сохранены");
    expect(mocks.rpc).toHaveBeenCalledWith("save_postpaid_agreement", { p_organization_id: "org-a", p_effective_from: "2026-10-01", p_effective_to: null, p_contract_reference: "Договор №7 от 01.10.2026", p_customer_confirmation: "Подписанное приложение, архив №8" });
    expect(mocks.rpc.mock.calls.some(([name]) => name === "issue_postpaid_invoice")).toBe(false);
  });

  it("requires retrospective counts and explicit review, then creates an invoice only as a separate action", async () => {
    setup(); await prepare();
    expect(screen.getByText("Курсы в журнале событий")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Создать счёт по подтверждённому расчёту" })).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_postpaid_statement", { p_organization_id: "org-a", p_period_start: "2026-10-01" });
    fillReview();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить расчёт" }));
    const issue = await screen.findByRole("button", { name: "Создать счёт по подтверждённому расчёту" });
    expect(mocks.rpc).toHaveBeenCalledWith("approve_postpaid_statement", { p_statement_id: "statement-a", p_review_note: "Сверено с журналом за октябрь, документ 17", p_courses_override: 16, p_learners_override: 101 });
    expect(screen.getByText(/^Стандарт · 6\s990 ₽$/)).toBeInTheDocument();
    expect(mocks.rpc.mock.calls.some(([name]) => name === "issue_postpaid_invoice")).toBe(false);
    fireEvent.click(issue);
    expect(await screen.findByRole("link", { name: "Открыть созданный счёт" })).toHaveAttribute("href", "/invoice/invoice-a");
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "issue_postpaid_invoice")).toHaveLength(1);
  });

  it("keeps an unfinished month unbillable even after draft preparation", async () => {
    prepared.snapshot.period_closed = false;
    setup(); await prepare();
    expect(screen.getByText(/Месяц ещё не завершён/)).toBeInTheDocument();
    expect(screen.getByLabelText("Курсы за месяц после сверки")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeDisabled();
    expect(mocks.rpc.mock.calls.some(([name]) => name === "approve_postpaid_statement" || name === "issue_postpaid_invoice")).toBe(false);
  });

  it("does not accept missing or fractional historical counts as a completed review", async () => {
    setup(); await prepare(); fillReview();
    fireEvent.change(screen.getByLabelText("Уникальные обучавшиеся после сверки"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Уникальные обучавшиеся после сверки"), { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Уникальные обучавшиеся после сверки"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Уникальные обучавшиеся после сверки"), { target: { value: "101" } });
    expect(screen.getByRole("button", { name: "Подтвердить расчёт" })).toBeEnabled();
  });

  it("reports failed review and never offers invoice creation from an unconfirmed response", async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === "approve_postpaid_statement" ? Promise.resolve({ data: null, error: null }) : original(name, args));
    setup(); await prepare(); fillReview();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить расчёт" }));
    await screen.findByText(/Сервер не подтвердил результат/);
    expect(screen.queryByRole("button", { name: "Создать счёт по подтверждённому расчёту" })).not.toBeInTheDocument();
    expect(screen.queryByText("Расчёт подтверждён. Теперь можно создать счёт.")).not.toBeInTheDocument();
  });

  it("clears the previous organization's approved statement and agreement drafts on organization switch", async () => {
    const view = setup(); await prepare(); fillReview();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить расчёт" }));
    await screen.findByRole("button", { name: "Создать счёт по подтверждённому расчёту" });
    view.switchOrg("org-b");
    expect(await screen.findByRole("button", { name: "Подключить постоплату" })).toBeDisabled();
    expect(screen.getByLabelText("Договор / основание")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Создать счёт по подтверждённому расчёту" })).not.toBeInTheDocument();
    expect(mocks.rpc.mock.calls.some(([name]) => name === "issue_postpaid_invoice")).toBe(false);
  });

  it("fails closed when overview contains another organization's statement", async () => {
    overview.statements = [statement({ organization_id: "foreign-org" })];
    setup();
    await screen.findByText(/Не удалось загрузить условия постоплаты/);
    expect(screen.queryByRole("button", { name: "Подготовить расчёт" })).not.toBeInTheDocument();
  });

  it("requires ordered consent evidence and sends timestamps separately from actual usage", async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === "record_postpaid_feature_confirmation"
      ? Promise.resolve({ data: { id: "consent-a", organization_id: "org-a", feature: "crm" }, error: null }) : original(name, args));
    setup();
    const button = await screen.findByRole("button", { name: "Сохранить подтверждение функции", hidden: true });
    fireEvent.change(screen.getByLabelText("Клиент уведомлён (местное время)"), { target: { value: "2026-10-02T10:00" } });
    fireEvent.change(screen.getByLabelText("Клиент подтвердил (местное время)"), { target: { value: "2026-10-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Основание подтверждения функции"), { target: { value: "Письмо директора от 02.10.2026" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Клиент подтвердил (местное время)"), { target: { value: "2026-10-02T11:00" } });
    fireEvent.click(button);
    await screen.findByText(/Подтверждение клиента сохранено/);
    expect(mocks.rpc).toHaveBeenCalledWith("record_postpaid_feature_confirmation", expect.objectContaining({ p_organization_id: "org-a", p_feature: "crm", p_notified_at: new Date("2026-10-02T10:00").toISOString(), p_confirmed_at: new Date("2026-10-02T11:00").toISOString() }));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "record_postpaid_feature_usage" || name === "issue_postpaid_invoice")).toBe(false);
  });

  it("records actual large-video upload evidence and surfaces a server rejection for missing prior consent", async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === "record_postpaid_feature_usage"
      ? Promise.resolve({ data: null, error: { message: "Нет предварительного согласия клиента" } }) : original(name, args));
    setup();
    const button = await screen.findByRole("button", { name: "Зафиксировать использование", hidden: true });
    fireEvent.change(screen.getByLabelText("Когда использована (местное время)"), { target: { value: "2026-10-03T12:00" } });
    fireEvent.change(screen.getByLabelText("Доказательство фактического использования"), { target: { value: "Видео 52, журнал успешной загрузки" } });
    fireEvent.change(screen.getByLabelText("Размер загруженного видеофайла, байт"), { target: { value: "2147483648" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Размер загруженного видеофайла, байт"), { target: { value: "2147483649" } });
    fireEvent.click(button);
    await screen.findByText("Нет предварительного согласия клиента");
    expect(mocks.rpc).toHaveBeenCalledWith("record_postpaid_feature_usage", expect.objectContaining({ p_organization_id: "org-a", p_feature: "videoserviceplus", p_bytes: 2147483649 }));
    expect(screen.queryByText(/Факт использования сохранён/)).not.toBeInTheDocument();
  });
});
