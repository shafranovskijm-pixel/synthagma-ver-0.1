import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgDocumentWorkflow } from "../useOrgDocumentWorkflow";
import { ids, workflow, workflowComment, workflowEnvelope, workflowCandidates, workflowId } from "@/lib/__tests__/orgDocumentWorkflow.fixture";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
let current: ReturnType<typeof workflowEnvelope>;
const deferred = () => { let resolve!: (x: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
const setup = () => renderHook(({ doc, version }) => useOrgDocumentWorkflow(ids.org, doc, version), { initialProps: { doc: ids.doc as string | null, version: ids.version } });
beforeEach(() => {
  current = workflowEnvelope(); mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "get_org_document_workflow" ? current : name === "list_org_document_review_candidates" ? workflowCandidates() : current.workflow }));
});
describe("internal review RPC lifecycle", () => {
  it("loads an explicit new cycle with no invented approval", async () => {
    current = workflowEnvelope(null); const { result } = setup(); await waitFor(() => expect(result.current.data?.revision).toBe(0));
    expect(result.current.data?.workflow).toBeNull(); expect(result.current.candidates?.actors[0].staff_id).toBeNull();
  });
  it.each([{ code: "42501" }, { code: "network" }])("read error is not an empty ready workflow %j", async error => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error }); const { result } = setup(); await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull(); await act(async () => expect(await result.current.saveDraft(ids.responsible, ids.reviewer, [])).toBe(false));
  });
  it("blocks mutations without current server capability", async () => {
    current.capabilities.can_configure = false; current.capabilities.can_submit = false; const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeTruthy()); const count = mocks.rpc.mock.calls.length;
    await act(async () => { expect(await result.current.saveDraft(ids.responsible, ids.reviewer, [])).toBe(false); expect(await result.current.transition("submit")).toBe(false); });
    expect(mocks.rpc).toHaveBeenCalledTimes(count);
  });
  it("loads read-only history without calling the write-only candidate selector", async () => {
    Object.keys(current.capabilities).forEach(k => { current.capabilities[k as keyof typeof current.capabilities] = false; });
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.error).toBeNull(); expect(result.current.candidates).toBeNull();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["get_org_document_workflow"]);
  });
  it("saves exact version and both revisions, then reads the authoritative current workflow", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    const saved = workflow({ revision: 2 });
    mocks.rpc.mockImplementationOnce(async (_name, args) => { expect(args).toMatchObject({ p_version_id: ids.version, p_expected_document_revision: 2, p_expected_workflow_revision: 1 }); current = workflowEnvelope(saved); return { data: saved, error: null }; });
    await act(async () => expect(await result.current.saveDraft(ids.responsible, ids.reviewer, [])).toBe(true));
    expect(result.current.data?.revision).toBe(2); expect(result.current.saved).toBe(true);
  });
  it("retains the same request UUID on uncertain retry and refuses a different operation until reload", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Lost response" } });
    await act(async () => expect(await result.current.saveDraft(ids.responsible, ids.reviewer, [])).toBe(false));
    const first = mocks.rpc.mock.calls.at(-1)!;
    await act(async () => expect(await result.current.transition("submit")).toBe(false));
    expect(mocks.rpc.mock.calls.at(-1)).toEqual(first);
    await act(async () => expect(await result.current.saveDraft(ids.responsible, ids.reviewer, [])).toBe(true));
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "save_org_document_review_draft")).toEqual([first, first]);
  });
  it("requires a reload after a stale revision instead of retrying over newer state", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    await act(async () => expect(await result.current.transition("submit")).toBe(false)); expect(result.current.conflict).toBe(true);
    const count = mocks.rpc.mock.calls.length; await act(async () => expect(await result.current.transition("submit")).toBe(false)); expect(mocks.rpc).toHaveBeenCalledTimes(count);
    current = workflowEnvelope(workflow({ revision: 3 })); await act(async () => result.current.reload()); expect(result.current.data?.revision).toBe(3); expect(result.current.conflict).toBe(false);
  });
  it("does not show a replay as latest state and fails closed when the post-save read fails", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    mocks.rpc.mockResolvedValueOnce({ data: workflow({ revision: 2 }), error: null }).mockResolvedValueOnce({ data: null, error: { message: "Read failed" } });
    await act(async () => expect(await result.current.transition("submit")).toBe(false));
    expect(result.current.saved).toBe(true); expect(result.current.data).toBeNull(); expect(result.current.error).toMatch(/сохранено/);
  });
  it("blocks duplicate clicks while one write is pending", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy()); const pending = deferred(); mocks.rpc.mockReturnValueOnce(pending.promise);
    let operation!: Promise<boolean>; act(() => { operation = result.current.transition("submit"); });
    await act(async () => expect(await result.current.transition("submit")).toBe(false));
    await act(async () => { pending.resolve({ data: current.workflow, error: null }); expect(await operation).toBe(true); });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "transition_org_document_review")).toHaveLength(1);
  });
  it("ignores an old write result after dialog close", async () => {
    const { result, rerender } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy()); const pending = deferred(); mocks.rpc.mockReturnValueOnce(pending.promise);
    let operation!: Promise<boolean>; act(() => { operation = result.current.transition("submit"); }); rerender({ doc: null, version: ids.version });
    await act(async () => { pending.resolve({ data: workflow(), error: null }); expect(await operation).toBe(false); }); expect(result.current.data).toBeNull();
  });
  it("a late read cannot replace the new file version with the old workflow", async () => {
    const old = deferred(); mocks.rpc.mockReturnValueOnce(old.promise);
    const { result, rerender } = setup();
    current = workflowEnvelope(null); current.document.current_version_id = workflowId(35); current.document.document_revision = 3;
    rerender({ doc: ids.doc, version: workflowId(35) });
    await waitFor(() => expect(result.current.data?.document.current_version_id).toBe(workflowId(35)));
    await act(async () => old.resolve({ data: workflowEnvelope(), error: null }));
    expect(result.current.data?.workflow).toBeNull(); expect(result.current.data?.document.document_revision).toBe(3);
  });
  it("rejects approval with accepted content changes even if a stale capability says yes", async () => {
    current = workflowEnvelope(workflow({ state: "in_review", comments: [workflowComment({ resolved: true, resolution_status: "accepted", position_anchor: { kind: "replace" } })] }));
    const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.transition("approve", "", "17", "2026-10-18")).toBe(false)); expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("binds a comment to the exact review/version without writing signing facts", async () => {
    current = workflowEnvelope(workflow({ state: "in_review" })); const { result } = setup(); await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => expect(await result.current.addComment("Замечание", "Текст", { kind: "comment" })).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledWith("add_org_document_review_comment", expect.objectContaining({ p_review_id: ids.review, p_version_id: ids.version, p_expected_workflow_revision: 1, p_text: "Замечание", p_request_id: expect.any(String) }));
    expect(mocks.rpc.mock.calls.every(([name]) => !/signature|pep|certificate|email/.test(name))).toBe(true);
  });
});
