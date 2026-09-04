import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { fetchGroupClassJournalMarks, saveGroupClassJournalMark, isCurrentGroupClassJournalMark, type GroupClassJournalMarksClient } from "../groupClassJournalMarks";
const scope = { organizationId: "o", groupId: "g" };
const group = { id: "g", organization_id: "o", course_id: "c", name: "Группа", training_dates: ["2026-09-04"] };
const profile: { user_id: string; full_name: string; organization_id: string; student_group_id: string; archived_at: string | null } = { user_id: "u", full_name: "Тест", organization_id: "o", student_group_id: "g", archived_at: null };
const mark = { id: "m", organization_id: "o", group_id: "g", user_id: "u", slot: 1, course_id: "c", source_date: "2026-09-04", mark: "П", revision: 1, updated_at: "2026-09-04T00:00:00Z", updated_by: "owner" };
function fixture() {
  const state = { group, profiles: [profile], marks: [] as typeof mark[], error: null as unknown, countDelta: 0 };
  const reads: { table: string; filters: Record<string, unknown>; from: number; to: number }[] = [];
  const rpc = vi.fn(async () => { state.marks = [mark]; return { data: mark as unknown, error: null as unknown }; });
  const client: GroupClassJournalMarksClient = { rpc, from(table) {
    const request = { table, filters: {} as Record<string, unknown>, from: 0, to: 99 };
    const result = () => { reads.push(request); const data = table === "profiles" ? state.profiles : state.marks; return { data: table === "student_groups" ? state.group : data.slice(request.from, request.to + 1), error: state.error, count: data.length + state.countDelta }; };
    const q = { select: () => q, eq: (k: string, v: string) => { request.filters[k] = v; return q; }, is: (k: "archived_at", v: null) => { request.filters[k] = v; return q; }, order: () => q, range: (from: number, to: number) => { request.from = from; request.to = to; return q; }, maybeSingle: async () => result(), then: <TResult1 = ReturnType<typeof result>, TResult2 = never>(resolve?: ((value: ReturnType<typeof result>) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) => Promise.resolve(result()).then(resolve, reject) }; return q;
  } }; return { state, client, rpc, reads };
}
describe("group class journal marks", () => {
  it("preserves separate slots with the same date and different marks", async () => {
    const f = fixture(); f.state.group = { ...group, training_dates: ["2026-09-04", "2026-09-04"] };
    f.state.marks = [mark, { ...mark, id: "m2", slot: 2, mark: "Н" }];
    const ctx = await fetchGroupClassJournalMarks(scope, f.client);
    expect(ctx.marks.map(m => m.mark)).toEqual(["П", "Н"]);
    expect(ctx.marks.every(m => isCurrentGroupClassJournalMark(m, ctx))).toBe(true);
  });
  it("rejects a replacement row id when updating an existing slot", async () => {
    const f = fixture(); f.state.marks = [mark]; const context = await fetchGroupClassJournalMarks(scope, f.client);
    f.rpc.mockResolvedValueOnce({ data: { ...mark, id: "replacement", revision: 2 }, error: null });
    await expect(saveGroupClassJournalMark({ ...scope, context, userId: "u", slot: 1, mark: "П" }, f.client)).rejects.toMatchObject({ requiresReload: true });
  });
  it("paginates active roster and preserves exact scoped filters", async () => {
    const f = fixture(); f.state.profiles = Array.from({ length: 201 }, (_, i) => ({ ...profile, user_id: `u${i}` }));
    const ctx = await fetchGroupClassJournalMarks(scope, f.client); expect(ctx.students).toHaveLength(201);
    expect(f.reads.filter(r => r.table === "profiles").map(r => r.from)).toEqual([0, 100, 200]);
    expect(f.reads.find(r => r.table === "profiles")?.filters).toEqual({ organization_id: "o", student_group_id: "g", archived_at: null });
  });
  it("preserves stale marks but does not classify them as current", async () => {
    const f = fixture(); f.state.marks = [{ ...mark, course_id: "old" }]; const ctx = await fetchGroupClassJournalMarks(scope, f.client);
    expect(ctx.marks).toHaveLength(1); expect(isCurrentGroupClassJournalMark(ctx.marks[0], ctx)).toBe(false);
  });
  it("saves once and returns full confirmed reload", async () => {
    const f = fixture(); const context = await fetchGroupClassJournalMarks(scope, f.client);
    const fresh = await saveGroupClassJournalMark({ ...scope, context, userId: "u", slot: 1, mark: "П" }, f.client);
    expect(fresh.marks).toEqual([mark]); expect(f.rpc).toHaveBeenCalledOnce();
  });
  it("blocks nonroster input without mutation", async () => {
    const f = fixture(); const context = await fetchGroupClassJournalMarks(scope, f.client);
    await expect(saveGroupClassJournalMark({ ...scope, context, userId: "foreign", slot: 1, mark: "П" }, f.client)).rejects.toThrow(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(["scope", "duplicate", "archived", "count"])("fails closed for %s source", async kind => {
    const f = fixture(); if (kind === "scope") f.state.group = { ...group, organization_id: "foreign" }; if (kind === "duplicate") f.state.profiles.push(profile); if (kind === "archived") f.state.profiles = [{ ...profile, archived_at: "2026" }]; if (kind === "count") f.state.countDelta = 1;
    await expect(fetchGroupClassJournalMarks(scope, f.client)).rejects.toThrow();
  });
  it("marks missing migration and uncertain save as reload-required without retry", async () => {
    const f = fixture(); const context = await fetchGroupClassJournalMarks(scope, f.client);
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    await expect(saveGroupClassJournalMark({ ...scope, context, userId: "u", slot: 1, mark: "П" }, f.client)).rejects.toMatchObject({ requiresReload: true }); expect(f.rpc).toHaveBeenCalledOnce();
  });
  it("rejects mismatched readback after acknowledged persistence", async () => {
    const f = fixture(); const context = await fetchGroupClassJournalMarks(scope, f.client);
    f.rpc.mockImplementationOnce(async () => { f.state.marks = [{ ...mark, mark: "Н" }]; return { data: mark, error: null }; });
    await expect(saveGroupClassJournalMark({ ...scope, context, userId: "u", slot: 1, mark: "П" }, f.client)).rejects.toMatchObject({ requiresReload: true });
  });
});
