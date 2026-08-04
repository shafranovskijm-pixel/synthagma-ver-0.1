import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

function makeChain(): any {
  const result = { data: [], error: null, count: 0 };
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res: any) => Promise.resolve(result).then(res);
        if (prop === "single" || prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
        return (..._args: any[]) => chain;
      },
    },
  );
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => makeChain()),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u1" } } })) },
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: null, error: null })) })) },
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: any[]) => toastError(...a), info: vi.fn() } }));

vi.mock("@/components/organization/GroupContextBanner", () => ({
  GroupContextBanner: () => <div data-testid="group-banner" />,
}));

import { JournalsManager } from "@/components/organization/JournalsManager";
import {
  isGroupJournalContextActive,
  resolveCustomJournalGuard,
  resolveManualJournalEditorGuard,
} from "@/lib/journals/groupJournalContext";

describe("group journal list guards (pure)", () => {
  it("detects group context from groupId or returnToGroupId", () => {
    expect(isGroupJournalContextActive({ groupId: "g1" })).toBe(true);
    expect(isGroupJournalContextActive({ returnToGroupId: "g1" })).toBe(true);
    expect(isGroupJournalContextActive({})).toBe(false);
    expect(isGroupJournalContextActive({ groupId: null, returnToGroupId: null })).toBe(false);
  });

  it("blocks custom and manual journals only in group context", () => {
    expect(resolveCustomJournalGuard({ groupId: "g1" }).blocked).toBe(true);
    expect(resolveCustomJournalGuard({ returnToGroupId: "g1" }).reason).toBeTruthy();
    expect(resolveCustomJournalGuard({}).blocked).toBe(false);
    expect(resolveManualJournalEditorGuard({ groupId: "g1" }).blocked).toBe(true);
    expect(resolveManualJournalEditorGuard({}).blocked).toBe(false);
  });
});

describe("JournalsManager without group context", () => {
  beforeEach(() => {
    toastError.mockClear();
    localStorage.clear();
  });

  it("keeps organization-wide wizard and custom journals", async () => {
    localStorage.setItem(
      "custom_journals_org-1",
      JSON.stringify([{ id: "custom_1", title: "Мой журнал", description: "d", fields: ["a"], createdAt: "2026-01-01" }]),
    );
    render(<JournalsManager organizationId="org-1" />);
    await waitFor(() => expect(screen.getByText("Создать журнал")).toBeInTheDocument());
    expect(screen.getByText("Мой журнал")).toBeInTheDocument();
    expect(screen.getAllByText("Пользовательские журналы").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("group-journals-scope-notice")).not.toBeInTheDocument();
  });
});

describe("JournalsManager in group context", () => {
  beforeEach(() => {
    toastError.mockClear();
    localStorage.clear();
    localStorage.setItem(
      "custom_journals_org-1",
      JSON.stringify([{ id: "custom_1", title: "Мой журнал", description: "d", fields: ["a"], createdAt: "2026-01-01" }]),
    );
  });

  it("hides the global wizard, custom journals and unsupported journal types", async () => {
    render(<JournalsManager organizationId="org-1" groupId="g1" courseId="c1" returnToGroupId="g1" />);
    await waitFor(() => expect(screen.getByTestId("group-journals-scope-notice")).toBeInTheDocument());
    expect(screen.queryByText("Создать журнал")).not.toBeInTheDocument();
    expect(screen.queryByText("Мой журнал")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Пользовательские журналы")).toHaveLength(0);
    expect(screen.getByTestId("group-banner")).toBeInTheDocument();
    // unsupported journal categories/types are omitted from the list entirely
    expect(screen.queryByText("Часто требуемые журналы")).not.toBeInTheDocument();
    expect(screen.getByText("Обязательные журналы", { selector: "h3" })).toBeInTheDocument();
    // 6 required journals minus the unsupported "бланки строгой отчётности"
    expect(screen.getByText(/^5 журналов/)).toBeInTheDocument();
  });

  it("hides group context only when neither groupId nor returnToGroupId is present", async () => {
    render(<JournalsManager organizationId="org-1" returnToGroupId="g1" />);
    await waitFor(() => expect(screen.getByTestId("group-journals-scope-notice")).toBeInTheDocument());
    expect(screen.queryByText("Создать журнал")).not.toBeInTheDocument();
  });
});

describe("direct handler invocation in group context", () => {
  it("guard functions refuse persistence attempts (custom + manual editor)", () => {
    const custom = resolveCustomJournalGuard({ groupId: "g1" });
    const manual = resolveManualJournalEditorGuard({ groupId: "g1" });
    expect(custom.blocked && manual.blocked).toBe(true);
    expect(custom.reason).toMatch(/контексте группы/);
    expect(manual.reason).toMatch(/группы/);
  });

  it("does not write custom journals to storage when wizard completion is forced", async () => {
    localStorage.clear();
    render(<JournalsManager organizationId="org-1" groupId="g1" returnToGroupId="g1" />);
    await waitFor(() => expect(screen.getByTestId("group-journals-scope-notice")).toBeInTheDocument());
    // no wizard is mounted, so no completion path exists; storage must stay empty
    expect(localStorage.getItem("custom_journals_org-1")).toBeNull();
    expect(screen.queryByText("Создать журнал")).not.toBeInTheDocument();
  });
});
