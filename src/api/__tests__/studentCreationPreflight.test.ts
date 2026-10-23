import { describe, expect, it, beforeEach, vi } from "vitest";
const state = vi.hoisted(() => ({ results: [] as any[], from: vi.fn(), reads: [] as any[], actor: { actorId: "actor", revision: 4 } as any, valid: true }));
vi.mock("@/utils/courseCache", () => ({ captureOfflineContext: () => state.actor, isOfflineActorCurrent: () => state.valid }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => { state.from(table); const r: any = { table, filters: [] }; state.reads.push(r); const chain: any = { select: (projection: string) => { r.projection = projection; return chain; }, eq: (column: string, value: string) => { r.filters.push(["eq", column, value]); return chain; }, ilike: (column: string, value: string) => { r.filters.push(["ilike", column, value]); return chain; }, neq: (column: string, value: string) => { r.filters.push(["neq", column, value]); return chain; }, limit: async (limit: number) => { r.limit = limit; const result = state.results.shift(); if (!result) throw new Error("Unexpected read"); return await result; } }; return chain; } } }));
import { checkExistingStudentForCreation } from "../studentCreationPreflight";
const profile = { user_id: "pupil", organization_id: "org", full_name: "Ученик", login: "Sgt_100" };
const course = { course_id: "old", courses: { id: "old", organization_id: "org", title: "Прежний курс" } };
beforeEach(() => { state.results = []; state.reads = []; state.valid = true; state.actor = { actorId: "actor", revision: 4 }; state.from.mockClear(); });
describe("ordinary authorized existing student preflight", () => {
  it("scopes literal case-insensitive identifiers and every returned course to the same organization", async () => {
    state.results = [{ data: [profile], error: null }, { data: [course], error: null }];
    const result = await checkExistingStudentForCreation("org", { login: "sgt_100", email: "" }, () => true);
    expect(result?.courses).toEqual([{ id: "old", title: "Прежний курс" }]);
    expect(state.reads[0].filters).toEqual([["eq", "organization_id", "org"], ["ilike", "login", "sgt\\_100"]]);
    expect(state.reads[1].filters).toContainEqual(["eq", "courses.organization_id", "org"]);
    expect(state.from.mock.calls.map(x => x[0])).toEqual(["profiles", "enrollments"]);
  });
  it("escapes percent and backslash rather than matching other logins by a pattern", async () => {
    state.results = [{ data: [], error: null }];
    await checkExistingStudentForCreation("org", { login: "a%_\\b", email: "" }, () => true);
    expect(state.reads[0].filters[1]).toEqual(["ilike", "login", "a\\%\\_\\\\b"]);
  });
  it("does not project a cross-organization profile even from a malformed transport response", async () => {
    state.results = [{ data: [{ ...profile, organization_id: "other" }], error: null }];
    await expect(checkExistingStudentForCreation("org", { login: "Sgt_100", email: "" }, () => true)).rejects.toThrow(/не удалось/i);
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it("does not project cross-organization course titles", async () => {
    state.results = [{ data: [profile], error: null }, { data: [{ ...course, courses: { ...course.courses, organization_id: "other" } }], error: null }];
    await expect(checkExistingStudentForCreation("org", { login: "Sgt_100", email: "" }, () => true)).rejects.toThrow(/не удалось/i);
  });
  it("refuses ambiguous login and email identities without any enrollment lookup", async () => {
    state.results = [{ data: [profile], error: null }, { data: [{ ...profile, user_id: "different" }], error: null }];
    await expect(checkExistingStudentForCreation("org", { login: "Sgt_100", email: "pupil@example.test" }, () => true)).rejects.toThrow(/разным ученикам/);
    expect(state.from.mock.calls.map(x => x[0])).toEqual(["profiles", "profiles"]);
  });
  it("a failed read is not evidence that the pupil is new", async () => {
    state.results = [{ data: null, error: { code: "42501" } }];
    await expect(checkExistingStudentForCreation("org", { login: "Sgt_100", email: "" }, () => true)).rejects.toThrow(/Данные не отправлены/);
  });
  it("discards a lookup completed after access revision or caller context changes", async () => {
    let resolve!: (value: any) => void; state.results = [new Promise(r => { resolve = r; })];
    const pending = checkExistingStudentForCreation("org", { login: "Sgt_100", email: "" }, () => true);
    state.valid = false; resolve({ data: [profile], error: null });
    await expect(pending).rejects.toThrow(/не удалось/i);
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it("returns no visible match after a successful exact own-organization read", async () => {
    state.results = [{ data: [], error: null }];
    expect(await checkExistingStudentForCreation("org", { login: "new", email: "" }, () => true)).toBeNull();
  });
});
