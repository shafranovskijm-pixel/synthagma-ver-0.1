import { useLayoutEffect } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicationError, type PublicationReviewContext, type PublicationTarget } from "@/lib/platformCoursePublication";
import { P, dossier, parsedContext } from "@/lib/__tests__/platformCoursePublication.fixtures";
const mock = vi.hoisted(() => ({ actor: "10000000-0000-0000-0000-000000000001" as string | null,
  context: vi.fn(), submit: vi.fn(), review: vi.fn(), publish: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mock.actor ? { id: mock.actor } : null,
  userRole: mock.actor ? "admin" : null, loading: false, authError: null }) }));
vi.mock("@/api/platformCoursePublication", () => ({ platformCoursePublication: mock }));
import { usePlatformPublicationReview } from "../usePlatformPublicationReview";
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = P.actor; vi.stubGlobal("crypto", { randomUUID: () => P.request });
  mock.context.mockReset().mockImplementation(async (target, actor) => parsedContext({}, target, actor));
  mock.submit.mockReset().mockResolvedValue(parsedContext()); mock.review.mockReset().mockResolvedValue(parsedContext());
  mock.publish.mockReset().mockResolvedValue(parsedContext());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => renderHook(({ open }) => usePlatformPublicationReview(P.target, open), { initialProps: { open: true } });
describe("persisted review scope and stale completions", () => {
  it("reloads the server dossier after unmount instead of treating a local draft as authority", async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current.context?.proposal?.supportedDossier).toEqual(dossier()));
    first.unmount();
    const second = mount();
    await waitFor(() => expect(second.result.current.context?.proposal?.supportedDossier).toEqual(dossier()));
    expect(mock.context).toHaveBeenCalledTimes(2);
    expect(mock.submit).not.toHaveBeenCalled(); expect(mock.review).not.toHaveBeenCalled();
  });
  it("ignores old context after the actor is lost and clears private view state", async () => {
    let finish!: (value: PublicationReviewContext) => void;
    mock.context.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = mount();
    await waitFor(() => expect(mock.context).toHaveBeenCalledOnce());
    mock.actor = null; rerender({ open: true });
    await act(async () => { finish(parsedContext()); await Promise.resolve(); });
    expect(result.current.context).toBeNull(); expect(result.current.available).toBe(false);
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });
  it("does not execute a handler captured before an actor switch", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    const staleSave = result.current.saveDossier;
    mock.actor = P.otherActor; rerender({ open: true });
    await waitFor(() => expect(result.current.context?.actorId).toBe(P.otherActor));
    await act(async () => { await staleSave(dossier()); });
    expect(mock.submit).not.toHaveBeenCalled();
  });
  it("invalidates a formerly returned context before any later toast/callback on close", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    const saved = result.current.context!;
    expect(result.current.isCurrentContext(saved)).toBe(true);
    rerender({ open: false });
    expect(result.current.isCurrentContext(saved)).toBe(false);
  });
  it("retains the same request UUID on an explicit retry of the same uncertain submission", async () => {
    mock.submit.mockRejectedValueOnce(new PublicationError("unavailable")).mockResolvedValueOnce(parsedContext());
    const { result } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    await act(async () => { await result.current.saveDossier(dossier()); });
    expect(result.current.error).toBe("unavailable");
    await act(async () => { await result.current.saveDossier(dossier()); });
    expect(mock.submit.mock.calls[0][4]).toBe(P.request);
    expect(mock.submit.mock.calls[1][4]).toBe(P.request);
  });
  it("does not call publication when the unchanged manual predicates fail", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    const check = vi.fn().mockResolvedValue(["Недостаточно занятий"]);
    await act(async () => { await result.current.publish(check); });
    expect(check).toHaveBeenCalledExactlyOnceWith(P.target, P.sha);
    expect(result.current.error).toBe("structural"); expect(result.current.structuralIssues).toEqual(["Недостаточно занятий"]);
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("does not publish after closing while the structural check is in flight", async () => {
    let finish!: (value: string[]) => void;
    const check = vi.fn(() => new Promise<string[]>(resolve => { finish = resolve; }));
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    let pending!: Promise<PublicationReviewContext | null>;
    act(() => { pending = result.current.publish(check); });
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    rerender({ open: false });
    await act(async () => { finish([]); await pending; });
    expect(mock.publish).not.toHaveBeenCalled(); expect(result.current.context).toBeNull();
  });
  it("uses exact publication result only after the structural proof completes in the same live scope", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    const check = vi.fn().mockResolvedValue([]); let returned: PublicationReviewContext | null = null;
    await act(async () => { returned = await result.current.publish(check); });
    expect(mock.publish).toHaveBeenCalledOnce(); expect(returned).not.toBeNull();
    expect(result.current.isCurrentContext(returned!)).toBe(true);
  });
  it("rejects duplicate pagination instead of silently dropping immutable history", async () => {
    const initial = parsedContext(); initial.historyHasMore = true; initial.historyNextBeforeSequence = "2";
    mock.context.mockResolvedValueOnce(initial).mockResolvedValueOnce(parsedContext());
    const { result } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toBe("invalid_response");
    expect(result.current.context?.history).toHaveLength(1);
  });
  it.each(["actor", "target"] as const)("hides context and blocks every new-render action before passive reset on %s switch", async change => {
    const targetB: PublicationTarget = { marketplaceId: "70000000-0000-0000-0000-000000000002", courseId: "30000000-0000-0000-0000-000000000002" };
    const operations = ["review", "save", "publish", "select", "history"] as const;
    for (const operation of operations) {
      mock.actor = P.actor; mock.context.mockImplementation(async (target, actor) => {
        const value = parsedContext({}, target, actor); value.historyHasMore = true; value.historyNextBeforeSequence = "2"; return value;
      });
      mock.review.mockClear(); mock.submit.mockClear(); mock.publish.mockClear();
      let oldContext: PublicationReviewContext | null = null;
      let observed: { context: PublicationReviewContext | null; oldIsCurrent: boolean; sideEffects: number } | null = null;
      const check = vi.fn().mockResolvedValue([]);
      const { result, rerender, unmount } = renderHook(({ target, inspect }: { target: PublicationTarget; inspect: boolean }) => {
        const review = usePlatformPublicationReview(target, true);
        useLayoutEffect(() => {
          if (!inspect) return;
          const before = mock.context.mock.calls.length + mock.review.mock.calls.length + mock.submit.mock.calls.length + check.mock.calls.length;
          const snapshot = { context: review.context, oldIsCurrent: !!oldContext && review.isCurrentContext(oldContext), sideEffects: 0 };
          if (operation === "review") void review.review("needs_revision", "Synthetic pre-effect probe", null);
          if (operation === "save") void review.saveDossier(dossier());
          if (operation === "publish") void review.publish(check);
          if (operation === "select") void review.selectProposal(P.proposal);
          if (operation === "history") void review.loadMore();
          snapshot.sideEffects = mock.context.mock.calls.length + mock.review.mock.calls.length + mock.submit.mock.calls.length + check.mock.calls.length - before;
          observed = snapshot;
          // The probe intentionally runs before this hook's passive loading effect.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [inspect]);
        return review;
      }, { initialProps: { target: P.target, inspect: false } });
      await waitFor(() => expect(result.current.context).not.toBeNull());
      await waitFor(() => expect(result.current.pending).toBe(false)); oldContext = result.current.context;
      if (change === "actor") mock.actor = P.otherActor;
      rerender({ target: change === "target" ? targetB : P.target, inspect: true });
      expect(observed).toEqual({ context: null, oldIsCurrent: false, sideEffects: 0 });
      expect(mock.review).not.toHaveBeenCalled(); expect(mock.submit).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
      expect(check).not.toHaveBeenCalled(); unmount();
    }
  });
  it("does not revive an A-scope handler when target identity cycles through B back to A", async () => {
    const targetB: PublicationTarget = { marketplaceId: "70000000-0000-0000-0000-000000000002", courseId: "30000000-0000-0000-0000-000000000002" };
    const { result, rerender } = renderHook(({ target }) => usePlatformPublicationReview(target, true), { initialProps: { target: P.target } });
    await waitFor(() => expect(result.current.context).not.toBeNull());
    const oldHandler = result.current.review, oldContext = result.current.context!, firstGeneration = result.current.scopeVersion;
    rerender({ target: targetB }); await waitFor(() => expect(result.current.context?.courseId).toBe(targetB.courseId));
    rerender({ target: P.target }); await waitFor(() => expect(result.current.context?.courseId).toBe(P.target.courseId));
    expect(result.current.scopeVersion).toBeGreaterThan(firstGeneration);
    expect(result.current.isCurrentContext(oldContext)).toBe(false);
    await act(async () => { expect(await oldHandler("needs_revision", "Synthetic old handler", null)).toBeNull(); });
    expect(mock.review).not.toHaveBeenCalled();
  });
  it("rejects an old dossier handler after a newer read in the same actor and target scope", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.context).not.toBeNull());
    const oldHandler = result.current.review;
    await act(async () => { await result.current.reload(); });
    await act(async () => { expect(await oldHandler("needs_revision", "Synthetic stale dossier", null)).toBeNull(); });
    expect(mock.review).not.toHaveBeenCalled();
  });

});
