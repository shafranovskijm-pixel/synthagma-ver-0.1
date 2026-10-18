import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProgramFacts, useCourseProgramBinding, useGroupProgramFacts } from "../useProgramFacts";
import { programFixture, programCandidatesFixture, courseBindingFixture, groupFactsFixture, pfId, pfOrg, pfProgram, pfCourse, pfGroup, pfEnrollment } from "@/lib/__tests__/programFacts.fixture";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const ok = (data: unknown) => ({ data, error: null });
const fail = (code?: string) => ({ data: null, error: { code, message: "Synthetic transport failure" } });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const createInput = () => ({ programId: pfProgram, name: "QA программа", description: "", fileVersionId: pfId(9), reviewerId: pfId(11), facts: programFixture().current_version!.facts });
function draft() { return { ...programFixture().current_version!, id: pfId(30), version_number: 2, revision: 4, state: "draft" as const, approved_at: null, approved_by: null }; }
function programmeReads(name: string) {
  if (name === "list_program_facts") return ok([programFixture()]);
  if (name === "list_program_facts_candidates") return ok(programCandidatesFixture());
  throw new Error(`Unexpected RPC ${name}`);
}
const calls = (name: string) => rpc.mock.calls.filter(c => c[0] === name);

describe("programme registry request boundaries", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("loads reader history without requesting the write-only directory", async () => {
    rpc.mockImplementation(async name => programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.programs?.[0].program.id).toBe(pfProgram);
    expect(calls("list_program_facts_candidates")).toHaveLength(0);
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(false); });
    expect(calls("create_program_facts_version")).toHaveLength(0);
  });
  it("retains readable history when candidate access is denied", async () => {
    rpc.mockImplementation(async name => name === "list_program_facts_candidates" ? fail("42501") : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.programs).toHaveLength(1); expect(h.result.current.candidates).toBeNull();
    expect(h.result.current.candidatesError).toContain("История программ доступна"); expect(h.result.current.denied).toBe(false);
  });
  it("reuses the exact request UUID and payload after an uncertain response", async () => {
    let attempts = 0;
    rpc.mockImplementation(async name => name === "create_program_facts_version" ? ++attempts === 1 ? fail() : ok(draft()) : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(false); });
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(true); });
    expect(calls("create_program_facts_version")).toHaveLength(2);
    expect(calls("create_program_facts_version")[0][1]).toEqual(calls("create_program_facts_version")[1][1]);
  });
  it("blocks a changed body while the previous write is unconfirmed", async () => {
    rpc.mockImplementation(async name => name === "create_program_facts_version" ? fail() : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { await h.result.current.createVersion(createInput()); });
    await act(async () => { expect(await h.result.current.createVersion({ ...createInput(), name: "Changed" })).toBe(false); });
    expect(calls("create_program_facts_version")).toHaveLength(1);
    expect(h.result.current.error).toContain("Исход предыдущего");
  });
  it("blocks duplicate clicks before React has rendered saving state", async () => {
    const write = deferred<ReturnType<typeof ok>>();
    rpc.mockImplementation(async name => name === "create_program_facts_version" ? write.promise : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    let first!: Promise<boolean>;
    await act(async () => { first = h.result.current.createVersion(createInput()); expect(await h.result.current.createVersion(createInput())).toBe(false); });
    expect(calls("create_program_facts_version")).toHaveLength(1);
    await act(async () => { write.resolve(ok(draft())); await first; });
  });
  it("requires refresh after a stale CAS instead of silently overwriting", async () => {
    rpc.mockImplementation(async name => name === "create_program_facts_version" ? fail("40001") : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { await h.result.current.createVersion(createInput()); });
    expect(h.result.current.conflict).toBe(true);
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(false); });
    expect(calls("create_program_facts_version")).toHaveLength(1);
    await act(async () => { await h.result.current.reload(); }); expect(h.result.current.conflict).toBe(false);
  });
  it("does not present a foreign programme receipt as a saved local version", async () => {
    rpc.mockImplementation(async name => name === "create_program_facts_version" ? ok({ ...draft(), organization_id: pfId(99) }) : programmeReads(name));
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(false); });
    expect(h.result.current.saved).toBe(false);
  });
  it("keeps a committed-write/read-failure distinct from a failed write", async () => {
    let written = false;
    rpc.mockImplementation(async name => {
      if (name === "create_program_facts_version") { written = true; return ok(draft()); }
      if (written && name === "list_program_facts") return fail();
      return programmeReads(name);
    });
    const h = renderHook(() => useProgramFacts(pfOrg, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.createVersion(createInput())).toBe(false); });
    expect(h.result.current.saved).toBe(true); expect(h.result.current.programs).toBeNull();
    expect(h.result.current.error).toContain("Изменение сохранено");
  });
  it("ignores a slow read from the previous organization", async () => {
    const first = deferred<ReturnType<typeof ok>>();
    rpc.mockImplementation(async (_name, args) => args.p_organization_id === pfOrg ? first.promise : ok([]));
    const h = renderHook(({ org }) => useProgramFacts(org), { initialProps: { org: pfOrg } });
    h.rerender({ org: pfId(99) });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { first.resolve(ok([programFixture()])); await first.promise; });
    expect(h.result.current.programs).toEqual([]);
  });
  it("does not apply a previous tenant's late write to the new view", async () => {
    const write = deferred<ReturnType<typeof ok>>();
    rpc.mockImplementation(async (name, args) => {
      if (name === "create_program_facts_version") return write.promise;
      if (name === "list_program_facts" && args.p_organization_id !== pfOrg) return ok([]);
      return programmeReads(name);
    });
    const h = renderHook(({ org }) => useProgramFacts(org, true), { initialProps: { org: pfOrg } });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    let pending!: Promise<boolean>; act(() => { pending = h.result.current.createVersion(createInput()); });
    h.rerender({ org: pfId(99) }); await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { write.resolve(ok(draft())); expect(await pending).toBe(false); });
    expect(h.result.current.programs).toEqual([]); expect(h.result.current.saved).toBe(false);
  });
});

describe("course and exact group enrollment binding hooks", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("does not fetch an unknown course or a group before tenant validation", async () => {
    const c = renderHook(() => useCourseProgramBinding(pfOrg, null)); const g = renderHook(() => useGroupProgramFacts(pfOrg, null));
    expect(c.result.current.loading).toBe(false); expect(g.result.current.loading).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });
  it("passes course CAS and refreshes the authoritative version after binding", async () => {
    let bound = false;
    rpc.mockImplementation(async name => {
      if (name === "get_course_program_binding") return ok(bound ? courseBindingFixture() : { revision: 0, binding: null, version: null });
      if (name === "bind_course_program_version") { bound = true; return ok(courseBindingFixture().binding); }
      throw new Error(name);
    });
    const h = renderHook(() => useCourseProgramBinding(pfOrg, pfCourse, true));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.bind(pfId(3))).toBe(true); });
    expect(calls("bind_course_program_version")[0][1].p_expected_revision).toBe(0);
    expect(h.result.current.data!.version!.facts.academic_hours).toBe(72);
  });
  it("honors assigned-group server capability without needing the org-wide directory", async () => {
    const g = groupFactsFixture(); g.enrollment_id = null; g.snapshot = null; g.capabilities.can_bind = true;
    rpc.mockImplementation(async name => name === "get_group_program_facts" ? ok(g) : name === "bind_group_program_version" ? ok(g.binding) : Promise.reject(new Error(name)));
    const h = renderHook(() => useGroupProgramFacts(pfOrg, pfGroup, null, false));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.bind(pfCourse, pfId(3))).toBe(true); });
    expect(calls("list_program_facts")).toHaveLength(0); expect(calls("list_program_facts_candidates")).toHaveLength(0);
  });
  it("does not confirm unrelated or already confirmed enrollment IDs", async () => {
    const g = groupFactsFixture(); g.enrollment_id = null; g.snapshot = null;
    rpc.mockResolvedValue(ok(g)); const h = renderHook(() => useGroupProgramFacts(pfOrg, pfGroup));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.confirmExisting([pfId(99)])).toBe(false); expect(await h.result.current.confirmExisting([pfEnrollment])).toBe(false); });
    expect(calls("confirm_group_program_enrollments")).toHaveLength(0);
  });
  it("confirms the exact requested association without replacing the legal date with now", async () => {
    const g = groupFactsFixture(), s = structuredClone(g.snapshot!); g.enrollment_id = null; g.snapshot = null;
    g.enrollments[0] = { ...g.enrollments[0], state: "unconfirmed", snapshot_id: null };
    rpc.mockImplementation(async name => name === "get_group_program_facts" ? ok(g) : name === "confirm_group_program_enrollments" ? ok({ snapshots: [s] }) : Promise.reject(new Error(name)));
    const h = renderHook(() => useGroupProgramFacts(pfOrg, pfGroup));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => { expect(await h.result.current.confirmExisting([pfEnrollment, pfEnrollment])).toBe(true); });
    const args = calls("confirm_group_program_enrollments")[0][1]; expect(args.p_enrollment_ids).toEqual([pfEnrollment]); expect(args).not.toHaveProperty("p_legal_enrollment_date");
  });
});
