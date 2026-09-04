import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJournalEditor } from "../useJournalEditor";
type Reply = { data: unknown; error: unknown };
type Call = { table: string; op: string; filters: Record<string, unknown>; payload?: Record<string, unknown>; single: boolean };
const mock = vi.hoisted(() => ({ run: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call: Call = { table, op: "read", filters: {}, single: false };
  const q = {
    select: () => q, order: () => q,
    eq: (key: string, value: unknown) => { call.filters[key] = value; return q; },
    in: (key: string, value: unknown) => { call.filters[key] = value; return q; },
    insert: (payload: Record<string, unknown>) => { call.op = "insert"; call.payload = payload; return q; },
    update: (payload: Record<string, unknown>) => { call.op = "update"; call.payload = payload; return q; },
    delete: () => { call.op = "delete"; return q; },
    single: () => { call.single = true; return q; },
    maybeSingle: () => { call.single = true; return q; },
    then: (resolve: (reply: Reply) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(mock.run(call)).then(resolve, reject),
  }; return q;
} } }));
vi.mock("sonner", () => ({ toast: { error: mock.error, success: mock.success } }));
const date = new Date(2026, 8, 4);
const journal = (id = "j1", course_id: string | null = null) => ({ id, organization_id: "org", course_id, journal_type: "entry_control", title: id, created_at: "2026-09-01T00:00:00Z" });
const student = { id: "p", user_id: "u", full_name: "Тест", email: "synthetic@example.invalid" };
const entry = { id: "e", journal_id: "j1", user_id: "u", entry_date: "2026-09-04", entry_type: "attendance", value: "absent", updated_at: "2026-09-04T00:00:00Z", notes: "" };
const ok = (data: unknown): Reply => ({ data, error: null });
function deferred() { let resolve!: (r: Reply) => void; const promise = new Promise<Reply>(r => { resolve = r; }); return { promise, resolve }; }
let initialEntries: unknown[];
let saved: Record<string, unknown>;
let override: (call: Call) => Reply | Promise<Reply> | undefined;
function normal(c: Call): Reply | Promise<Reply> {
  const custom = override(c); if (custom !== undefined) return custom;
  if (c.table === "courses") return ok([]);
  if (c.table === "journal_instances") return ok(c.single ? journal(String(c.filters.id), c.filters.id === "j2" ? "c2" : null) : [journal(), journal("j2", "c2")]);
  if (c.table === "enrollments") return ok([]);
  if (c.table === "profiles") return ok([student]);
  if (c.op !== "read") { saved = { ...entry, ...c.payload }; return ok(saved); }
  return ok(c.single ? saved : initialEntries);
}
const hook = () => renderHook(() => useJournalEditor({ organizationId: "org", journalType: "entry_control", journalTitle: "Журнал", onClose: vi.fn() }));
async function ready(h: ReturnType<typeof hook>) { await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j1")); }
beforeEach(() => { vi.clearAllMocks(); initialEntries = []; saved = {}; override = () => undefined; mock.run.mockImplementation(normal); });
describe("manual journal persistence", () => {
  it.each(["success", "error"])("requires a fresh reload after pending save A→B→A and readback %s", async outcome => {
    const pending = deferred();
    override = c => {
      if (c.op === "insert") return pending.promise;
      if (outcome === "error" && c.table === "journal_entries" && c.op === "read" && c.single) return { data: null, error: { message: "uncertain readback" } };
      return undefined;
    };
    const h = hook(); await ready(h); let write!: Promise<void>;
    act(() => { write = h.result.current.updateEntry("u", date, "present"); });
    act(() => h.result.current.setSelectedJournalId("j2"));
    await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j2"));
    act(() => h.result.current.setSelectedJournalId("j1"));
    await waitFor(() => { expect(h.result.current.journalInstance?.id).toBe("j1"); expect(h.result.current.loading).toBe(false); });
    expect(h.result.current.entries.size).toBe(0);
    saved = { ...entry, value: "present" };
    await act(async () => { pending.resolve(ok(saved)); await write; });
    expect(h.result.current.writeBlocked).toBe(true);
    await act(async () => { await h.result.current.updateEntry("u", date, "late"); });
    expect(mock.run.mock.calls.filter(([c]) => c.op === "insert")).toHaveLength(1);
    initialEntries = [saved]; override = () => undefined;
    act(() => h.result.current.reloadJournal());
    await waitFor(() => { expect(h.result.current.writeBlocked).toBe(false); expect(h.result.current.getEntryValue("u", date)).toBe("present"); });
    await act(async () => { await h.result.current.updateEntry("u", date, "late"); });
    expect(mock.run.mock.calls.filter(([c]) => c.op === "insert")).toHaveLength(1);
    expect(mock.run.mock.calls.filter(([c]) => c.op === "update")).toHaveLength(1);
  });
  it.each(["error", "mismatch"])("blocks an uncertain persisted insert after readback %s even before rerender", async kind => {
    override = c => c.table === "journal_entries" && c.op === "read" && c.single
      ? kind === "error" ? { data: null, error: { message: "uncertain" } } : ok({ ...saved, value: "different" }) : undefined;
    const h = hook(); await ready(h);
    await act(async () => { await h.result.current.updateEntry("u", date, "present"); await h.result.current.updateEntry("u", date, "late"); });
    expect(h.result.current.writeBlocked).toBe(true);
    expect(mock.run.mock.calls.filter(([c]) => c.op !== "read")).toHaveLength(1);
  });
  it("reloads the persisted insert before unblocking and next save updates its id", async () => {
    override = c => c.table === "journal_entries" && c.op === "read" && c.single ? { data: null, error: { message: "uncertain" } } : undefined;
    const h = hook(); await ready(h); await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    expect(h.result.current.writeBlocked).toBe(true);
    initialEntries = [saved]; override = () => undefined;
    act(() => h.result.current.reloadJournal());
    await waitFor(() => { expect(h.result.current.writeBlocked).toBe(false); expect(h.result.current.getEntryValue("u", date)).toBe("present"); });
    await act(async () => { await h.result.current.updateEntry("u", date, "late"); });
    const writes = mock.run.mock.calls.map(([c]) => c).filter(c => c.op !== "read");
    expect(writes.map(c => c.op)).toEqual(["insert", "update"]); expect(writes[1].filters.id).toBe("e");
  });
  it("failed reload retains the uncertain-write lock", async () => {
    override = c => c.table === "journal_entries" && c.op === "read" && c.single ? { data: null, error: { message: "uncertain" } } : undefined;
    const h = hook(); await ready(h); await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    mock.error.mockClear();
    override = c => c.table === "journal_instances" ? { data: null, error: { message: "reload failed" } } : undefined;
    act(() => h.result.current.reloadJournal()); await waitFor(() => expect(mock.error).toHaveBeenCalled());
    expect(h.result.current.writeBlocked).toBe(true);
    await act(async () => { await h.result.current.updateEntry("u", date, "late"); });
    expect(mock.run.mock.calls.filter(([c]) => c.op !== "read")).toHaveLength(1);
  });
  it.each(["insert", "delete"])("locks uncertain journal %s and reloads list preserving existing selection", async operation => {
    override = c => c.table === "journal_instances" && c.op === operation ? { data: null, error: { message: "uncertain" } } : undefined;
    const h = hook(); await ready(h);
    act(() => h.result.current.setSelectedJournalId("j2")); await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j2"));
    await act(async () => {
      if (operation === "insert") await h.result.current.createJournal(); else await h.result.current.deleteJournal();
    });
    expect(h.result.current.writeBlocked).toBe(true); override = () => undefined;
    act(() => h.result.current.reloadJournal());
    await waitFor(() => { expect(h.result.current.writeBlocked).toBe(false); expect(h.result.current.journalInstance?.id).toBe("j2"); });
    expect(h.result.current.selectedJournalId).toBe("j2");
  });
  it.each(["id", "organization_id", "journal_type", "course_id"])("rejects unconfirmed create field %s", async field => {
    override = c => c.table === "journal_instances" && c.op === "insert" ? ok({ ...journal("created"), [field]: field === "id" ? null : "wrong" }) : undefined;
    const h = hook(); await ready(h);
    await act(async () => { await h.result.current.createJournal(); });
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalled(); expect(h.result.current.existingJournals).toHaveLength(2);
  });
  it("does not claim success for zero-row deletion", async () => {
    override = c => c.op === "delete" ? ok([]) : undefined;
    const h = hook(); await ready(h); await act(async () => { await h.result.current.deleteJournal(); });
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalled(); expect(h.result.current.selectedJournalId).toBe("j1");
  });
  it("deletes selected second journal and selects remaining first, with tenant filters", async () => {
    override = c => c.op === "delete" ? ok([{ id: c.filters.id }]) : undefined;
    const h = hook(); await ready(h); act(() => h.result.current.setSelectedJournalId("j2"));
    await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j2"));
    await act(async () => { await h.result.current.deleteJournal(); });
    await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j1"));
    const deletion = mock.run.mock.calls.map(([c]) => c).find(c => c.op === "delete");
    expect(deletion.filters).toEqual({ id: "j2", organization_id: "org", journal_type: "entry_control" });
    expect(h.result.current.existingJournals.map(j => j.id)).toEqual(["j1"]);
  });
  it("uses confirmed entry identity for two sequential writes before React rerender", async () => {
    const h = hook(); await ready(h);
    await act(async () => { await h.result.current.updateEntry("u", date, "present"); await h.result.current.updateEntry("u", date, "late"); });
    expect(mock.run.mock.calls.filter(([c]) => c.op === "insert")).toHaveLength(1);
    expect(mock.run.mock.calls.filter(([c]) => c.op === "update")).toHaveLength(1);
    expect(h.result.current.getEntryValue("u", date)).toBe("late");
  });
  it("entry_control persists attendance and confirms by readback", async () => {
    const h = hook(); await ready(h);
    await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    expect(mock.run.mock.calls.map(([c]) => c).find(c => c.op === "insert").payload.entry_type).toBe("attendance");
    expect(h.result.current.getEntryValue("u", date)).toBe("present");
  });
  it("zero-row update does not change local value", async () => {
    initialEntries = [entry]; override = c => c.op === "update" ? ok(null) : undefined;
    const h = hook(); await ready(h); await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    expect(h.result.current.getEntryValue("u", date)).toBe("absent"); expect(mock.error).toHaveBeenCalled();
  });
  it.each(["mismatch", "error"])("does not optimistically accept readback %s", async kind => {
    override = c => c.table === "journal_entries" && c.op === "read" && c.single ? kind === "error" ? { data: null, error: { message: "failed" } } : ok({ ...saved, value: "absent" }) : undefined;
    const h = hook(); await ready(h); await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    expect(h.result.current.getEntryValue("u", date)).toBe(""); expect(mock.error).toHaveBeenCalled();
  });
  it("blocks a local double click while insertion is pending", async () => {
    const pending = deferred(); override = c => c.op === "insert" ? pending.promise : undefined;
    const h = hook(); await ready(h); let first!: Promise<void>;
    act(() => { first = h.result.current.updateEntry("u", date, "present"); });
    await act(async () => { await h.result.current.updateEntry("u", date, "present"); });
    expect(mock.run.mock.calls.filter(([c]) => c.op === "insert")).toHaveLength(1);
    saved = { ...entry, value: "present" }; await act(async () => { pending.resolve(ok(saved)); await first; });
  });
  it("late fetch cannot paint the old journal after selection changes", async () => {
    const pending = deferred(); override = c => c.table === "journal_entries" && c.filters.journal_id === "j1" ? pending.promise : undefined;
    const h = hook(); await waitFor(() => expect(mock.run.mock.calls.some(([c]) => c.table === "journal_entries")).toBe(true));
    act(() => h.result.current.setSelectedJournalId("j2")); await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j2"));
    await act(async () => { pending.resolve(ok([entry])); }); expect(h.result.current.journalInstance?.id).toBe("j2"); expect(h.result.current.entries.size).toBe(0);
  });
  it("late save cannot paint the old journal; empty enrollment roster clears students", async () => {
    const pending = deferred(); override = c => c.op === "insert" ? pending.promise : undefined;
    const h = hook(); await ready(h); expect(h.result.current.students).toHaveLength(1); let save!: Promise<void>;
    act(() => { save = h.result.current.updateEntry("u", date, "present"); });
    act(() => h.result.current.setSelectedJournalId("j2")); await waitFor(() => expect(h.result.current.journalInstance?.id).toBe("j2"));
    saved = { ...entry, value: "present" }; await act(async () => { pending.resolve(ok(saved)); await save; });
    expect(h.result.current.students).toEqual([]); expect(h.result.current.entries.size).toBe(0);
  });
  it("reports initial database errors rather than empty success", async () => {
    override = c => c.table === "courses" ? { data: null, error: { message: "failed" } } : undefined;
    const h = hook(); await waitFor(() => expect(mock.error).toHaveBeenCalled()); expect(h.result.current.journalInstance).toBeNull(); expect(mock.success).not.toHaveBeenCalled();
  });
  it("duplicate user/date rows disable writes", async () => {
    initialEntries = [entry, { ...entry, id: "duplicate" }]; const h = hook(); await waitFor(() => expect(mock.error).toHaveBeenCalled());
    await act(async () => { await h.result.current.updateEntry("u", date, "present"); }); expect(h.result.current.journalInstance).toBeNull();
    expect(mock.run.mock.calls.filter(([c]) => c.op !== "read")).toHaveLength(0);
  });
});
