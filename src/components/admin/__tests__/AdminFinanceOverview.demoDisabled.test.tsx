import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFinanceOverview } from "../AdminFinanceOverview";

const db = vi.hoisted(() => ({
  from: vi.fn(), invoke: vi.fn(), rpc: vi.fn(),
  insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(),
}));

// Only the external data boundary is replaced: the screen and Radix UI are real.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from, rpc: db.rpc, functions: { invoke: db.invoke } },
}));

const allowedTables = ["course_payments", "organization_payment_settings", "balance_transactions"];
let dataByTable: Record<string, unknown[]>;

function payment(id: string, email: string, course: string, organization: string) {
  return {
    id, email, amount: 1200, status: "CONFIRMED",
    created_at: "2026-09-01T10:00:00Z", paid_at: "2026-09-01T10:05:00Z",
    courses: { title: course, organizations: { name: organization } },
  };
}

async function renderLoaded() {
  render(<AdminFinanceOverview />);
  await screen.findByText("alpha@example.invalid");
  expect(screen.getByRole("button", { name: "Обновить" })).toBeEnabled();
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  // Radix activates its real tab on the primary mouse-down, not a bare click.
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.mouseUp(tab, { button: 0 });
  fireEvent.click(tab);
  expect(tab).toHaveAttribute("aria-selected", "true");
  return screen.getByRole("tabpanel", { name });
}

describe("AdminFinanceOverview without the payment demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataByTable = {
      course_payments: [
        payment("payment-alpha", "alpha@example.invalid", "Курс охраны труда", "Учебный центр Альфа"),
        payment("payment-beta", "beta@example.invalid", "Курс пожарной безопасности", "Центр Бета"),
      ],
      organization_payment_settings: [{
        organization_id: "synthetic-organization", terminal_key: "SYNTHETIC-ONLY-0001",
        is_test_mode: true, payment_mode: "redirect", organizations: { name: "Учебный центр Альфа" },
      }],
      balance_transactions: [{
        id: "synthetic-transaction", amount: 500, type: "topup",
        description: "Синтетическое пополнение", created_at: "2026-09-01T11:00:00Z",
        organizations: { name: "Учебный центр Альфа" },
      }],
    };
    for (const mutation of [db.invoke, db.rpc, db.insert, db.update, db.upsert, db.delete]) {
      mutation.mockImplementation(() => { throw new Error("Unexpected finance mutation or function call"); });
    }
    db.from.mockImplementation((table: string) => {
      if (!allowedTables.includes(table)) throw new Error(`Unexpected finance table: ${table}`);
      const query = {
        select: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query),
        insert: db.insert, update: db.update, upsert: db.upsert, delete: db.delete,
        then: (fulfilled: (value: unknown) => unknown, rejected?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: structuredClone(dataByTable[table]), error: null }).then(fulfilled, rejected),
      };
      return query;
    });
  });

  afterEach(() => {
    cleanup();
    for (const mutation of [db.invoke, db.rpc, db.insert, db.update, db.upsert, db.delete]) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });

  it("removes only the demo tab and keeps all three real finance tabs navigable without writes", async () => {
    await renderLoaded();

    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual([
      "Все платежи", "Настройки касс", "Транзакции баланса",
    ]);
    expect(screen.queryByRole("tab", { name: /Тест платежей/ })).not.toBeInTheDocument();

    const registers = selectTab("Настройки касс");
    expect(registers).toBeVisible();
    expect(within(registers).getByText("Учебный центр Альфа")).toBeInTheDocument();
    expect(within(registers).getByText("SYNT••••0001")).toBeInTheDocument();
    expect(within(registers).getByText("Редирект")).toBeInTheDocument();

    const transactions = selectTab("Транзакции баланса");
    expect(transactions).toBeVisible();
    expect(within(transactions).getByText("Синтетическое пополнение")).toBeInTheDocument();
    expect(within(transactions).getByText("Пополнение")).toBeInTheDocument();

    const payments = selectTab("Все платежи");
    expect(payments).toBeVisible();
    expect(within(payments).getByText("alpha@example.invalid")).toBeInTheDocument();
    expect(within(payments).getByText("beta@example.invalid")).toBeInTheDocument();
    expect(db.from.mock.calls.map(([table]) => table)).toEqual(allowedTables);
  });

  it.each([
    ["email", "ALPHA@EXAMPLE.INVALID"],
    ["course", "ОХРАНЫ ТРУДА"],
    ["organization", "АЛЬФА"],
  ])("keeps payment search by %s and clearing the search functional", async (_field, query) => {
    await renderLoaded();
    const search = screen.getByPlaceholderText("Поиск по email, курсу или организации...");

    fireEvent.change(search, { target: { value: query } });
    expect(screen.getByText("alpha@example.invalid")).toBeInTheDocument();
    expect(screen.queryByText("beta@example.invalid")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "неизвестный синтетический плательщик" } });
    expect(screen.getByText("Платежей не найдено")).toBeInTheDocument();
    expect(screen.queryByText("alpha@example.invalid")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("alpha@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("beta@example.invalid")).toBeInTheDocument();
    expect(db.from.mock.calls.map(([table]) => table)).toEqual(allowedTables);
  });

  it("refreshes payments from the external reads and renders the newly returned data without mutations", async () => {
    await renderLoaded();
    dataByTable.course_payments = [
      payment("payment-refreshed", "refreshed@example.invalid", "Обновлённый курс", "Новая синтетическая организация"),
    ];

    fireEvent.click(screen.getByRole("button", { name: "Обновить" }));

    expect(await screen.findByText("refreshed@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("Обновлённый курс")).toBeInTheDocument();
    expect(screen.queryByText("alpha@example.invalid")).not.toBeInTheDocument();
    expect(screen.queryByText("beta@example.invalid")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Обновить" })).toBeEnabled());
    expect(db.from.mock.calls.map(([table]) => table)).toEqual([...allowedTables, ...allowedTables]);
  });

  it("does not load the demo integration SDK globally from index.html", () => {
    const index = new DOMParser().parseFromString(readFileSync(resolve(process.cwd(), "index.html"), "utf8"), "text/html");
    const globalScripts = [...index.querySelectorAll<HTMLScriptElement>("script[src]")].map(script => script.getAttribute("src"));
    expect(globalScripts).not.toContain("https://integrationjs.t-static.ru/integration.js");
  });
});
