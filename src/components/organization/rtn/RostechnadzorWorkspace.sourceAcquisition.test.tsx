import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RtnBank, RtnWorkspace } from "@/types/rostechnadzor";
import { RostechnadzorWorkspace } from "./RostechnadzorWorkspace";

const api = vi.hoisted(() => ({ getRtnWorkspace: vi.fn(), checkRtnSource: vi.fn(), assignRtnTraining: vi.fn(), saveRtnSettings: vi.fn() }));
vi.mock("@/api/rostechnadzor", () => api);
vi.mock("./RtnEditorialPanel", () => ({ RtnEditorialPanel: () => null }));
vi.mock("./RtnUpdatesFeed", () => ({ RtnUpdatesFeed: () => null }));
vi.mock("./RtnPersonalPreferences", () => ({ RtnPersonalPreferences: () => null }));
vi.mock("./RtnNewsSourceCheck", () => ({ RtnNewsSourceCheck: () => null }));

const bank: RtnBank = {
  id: "bank-a", code: "A.1", title: "Основы промышленной безопасности", domain: "industrial-safety",
  source_id: "source-a", source_revision_id: "source-revision-a", bank_revision_id: "bank-revision-a",
  source_url: "https://www.gosnadzor.ru/service/", approved_on: null, effective_from: null,
  question_count: 211, release_id: null, key_status: "unreviewed", available_for_training: false,
  can_manual_check: false, normative_status: "review_required", last_checked_at: "2026-11-21T14:00:00Z",
  last_success_at: null, check_status: "error", source_acquisition_method: "admin_upload",
  source_received_at: "2026-11-22T14:01:28Z",
};

function mount(value: RtnBank) {
  const workspace: RtnWorkspace = {
    access: { allowed: true, reason: "included", can_manage: true, can_assign: true, can_view_results: true, pilot: true },
    banks: [value], settings: { notify_updates: true, show_archived_releases: false }, checks: [], assignments: [], results: [], students: [], groups: [],
  };
  api.getRtnWorkspace.mockResolvedValue(workspace);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><RostechnadzorWorkspace organizationId="org-a" actorId="actor-a"
    navigation={{ view: "sources", bankId: null, eventId: null, invalidTarget: false }} /></QueryClientProvider>);
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("official file acquisition in Sources", () => {
  it("shows the confirmed manual date in Moscow time while automatic verification remains failed and unconfirmed", async () => {
    mount(bank);
    const sourcePanel = await screen.findByRole("region", { name: "Проверка источников" });
    expect(await within(sourcePanel).findByText(/Файл загружен администратором:/)).toHaveTextContent("22.11.2026, 17:01 МСК");
    expect(within(sourcePanel).getByText(/Файл загружен администратором:/)).toHaveTextContent("Дата автоматической проверки сайта не изменена.");
    expect(within(sourcePanel).getByText("Последняя успешная проверка: Не подтверждено")).toBeInTheDocument();
    expect(within(sourcePanel).getByText("Не удалось проверить источник")).toBeInTheDocument();
    expect(within(sourcePanel).getByRole("button", { name: "Проверить обновления сейчас" })).toBeDisabled();
    expect(api.checkRtnSource).not.toHaveBeenCalled();
    expect(api.assignRtnTraining).not.toHaveBeenCalled();
  });

  it.each(["official_http", "unknown"] as const)("does not describe a %s original as an administrator upload", async method => {
    mount({ ...bank, source_acquisition_method: method, last_success_at: "2026-11-19T09:00:00Z" });
    const sourcePanel = await screen.findByRole("region", { name: "Проверка источников" });
    await within(sourcePanel).findByText(/Последняя успешная проверка:/);
    expect(within(sourcePanel).queryByText(/Файл загружен администратором:/)).not.toBeInTheDocument();
    expect(api.checkRtnSource).not.toHaveBeenCalled();
  });

  it("does not claim a manual receipt for an unbound source revision", async () => {
    mount({ ...bank, source_revision_id: null });
    const sourcePanel = await screen.findByRole("region", { name: "Проверка источников" });
    await within(sourcePanel).findByText(/Последняя успешная проверка:/);
    expect(within(sourcePanel).queryByText(/Файл загружен администратором:/)).not.toBeInTheDocument();
  });

  it("does not borrow an automatic success date when the manual receipt date is missing", async () => {
    mount({ ...bank, source_received_at: null, last_success_at: "2026-11-19T09:00:00Z" });
    const sourcePanel = await screen.findByRole("region", { name: "Проверка источников" });
    expect(await within(sourcePanel).findByText(/Файл загружен администратором:/)).toHaveTextContent("Файл загружен администратором: Не подтверждено.");
    expect(within(sourcePanel).getByText(/Файл загружен администратором:/)).not.toHaveTextContent("19.11.2026");
    expect(within(sourcePanel).getByText(/Последняя успешная проверка:/)).toHaveTextContent("19.11.2026");
  });
});
