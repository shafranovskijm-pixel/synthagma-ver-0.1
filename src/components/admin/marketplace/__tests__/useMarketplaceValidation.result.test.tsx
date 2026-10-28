import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P, parsedContext, readinessDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
import { parsePublicationReadiness, PLATFORM_REVIEW_ORG_ID, type PublicationTarget } from "@/lib/platformCoursePublication";

const mock = vi.hoisted(() => ({
  actor: "10000000-0000-0000-0000-000000000001" as string | null,
  readiness: vi.fn(), context: vi.fn(), publish: vi.fn(), validateSingle: vi.fn(), validateBulk: vi.fn(),
  from: vi.fn(), generation: vi.fn(), toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mock.actor ? { id: mock.actor } : null,
  userRole: mock.actor ? "admin" : null, loading: false, authError: null }) }));
vi.mock("@/api/platformCoursePublication", () => ({ platformCoursePublication: { readiness: mock.readiness, context: mock.context, publish: mock.publish } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mock.generation }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../validationHelpers", () => ({ validateCourseIssues: mock.validateSingle, validateCourseIssuesSimple: mock.validateBulk }));
import { useMarketplaceValidation } from "../useMarketplaceValidation";

function row(n: number, own = true) {
  const suffix = String(n).padStart(12, "0"), org = own ? PLATFORM_REVIEW_ORG_ID : P.otherActor;
  return { id: `70000000-0000-0000-0000-${suffix}`, course_id: `30000000-0000-0000-0000-${suffix}`, organization_id: org,
    is_validated: false, source_course_id: P.target.courseId,
    course: { id: `30000000-0000-0000-0000-${suffix}`, title: `Synthetic course ${n}`, organization_id: org } };
}
const rows = [row(1), row(2), row(3)];
const rules = { minLessons: 3, minContentLength: 50, requireText: true, requireTest: true, checkDuplicateTitles: true };
function missing(target: PublicationTarget) {
  return parsePublicationReadiness(readinessDto({ state: "review_missing", proposal_id: null, review_id: null, blockers: ["explicit_template_review_missing"] }, target), target);
}
function mount(items = rows) {
  const fetchData = vi.fn();
  return { fetchData, ...renderHook(({ courses }) => useMarketplaceValidation({ courses, dbCategories: [], fetchData,
    aiProvider: "synthetic", aiPrompts: {}, valRules: rules }), { initialProps: { courses: items } }) };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = P.actor;
  vi.stubGlobal("crypto", { randomUUID: () => P.request });
  mock.readiness.mockReset().mockImplementation(async (target: PublicationTarget) => missing(target));
  mock.context.mockReset().mockImplementation(async (target: PublicationTarget) => parsedContext({}, target));
  mock.publish.mockReset().mockImplementation(async current => ({ ...current, readiness: { ...current.readiness, isValidated: true } }));
  mock.validateSingle.mockReset().mockResolvedValue([]); mock.validateBulk.mockReset().mockResolvedValue([]);
  mock.from.mockImplementation(() => { throw new Error("No direct DML in moderation check flow"); });
  mock.generation.mockImplementation(() => { throw new Error("No generation in moderation flow"); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("own structural checks remain separate from explicit methodical publication", () => {
  it("reports a read-only structural pass and missing dossier without promoting the listing", async () => {
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(mock.validateSingle).toHaveBeenCalledExactlyOnceWith(rows[0].course_id, rules);
    expect(mock.readiness).toHaveBeenCalledTimes(2);
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("ok");
    expect(result.current.publicationByCourse[rows[0].course_id].state).toBe("review_missing");
    expect(result.current.publicationReport[0].published).toBe(false);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled();
    expect(mock.generation).not.toHaveBeenCalled(); expect(fetchData).not.toHaveBeenCalled();
    expect(mock.toast.success).not.toHaveBeenCalled();
  });
  it("preserves structural issues as editor/recheck work without auto-fixing or guessing keys", async () => {
    mock.validateSingle.mockResolvedValueOnce(["Нет тестов"]);
    const { result } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validationReport).toEqual([{ courseId: rows[0].course_id, title: rows[0].course.title, issues: ["Нет тестов"] }]);
    expect(result.current.validationReportOk).toBe(0);
    expect(mock.generation).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });
  it("does not manufacture a structural check from an old true publication bit", () => {
    const { result } = mount([{ ...rows[0], is_validated: true }]);
    expect(result.current.validatedCourses).toEqual({});
    expect(result.current.publicationByCourse).toEqual({});
  });
  it.each(["readiness", "checker"])("does not count a failed %s read as success or repair it", async mode => {
    if (mode === "readiness") mock.readiness.mockRejectedValueOnce(new Error("Synthetic unavailable"));
    else mock.validateSingle.mockRejectedValueOnce(new Error("Synthetic unavailable"));
    const { result } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validationReportOk).toBe(0);
    expect(result.current.publicationReport[0].readiness).toBeNull();
    expect(mock.toast.success).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.generation).not.toHaveBeenCalled();
  });
  it("cannot bind an old structural result to a changed edition", async () => {
    mock.readiness.mockImplementationOnce(async target => missing(target)).mockImplementationOnce(async target => ({ ...missing(target), editionSha256: P.changedSha }));
    const { result } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validationReportOk).toBe(0);
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("error");
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("does not inspect, modify or count a client copy, even with the same title/lineage", async () => {
    const client = row(9, false), { result } = mount([client]);
    await act(async () => {
      await result.current.handleValidateCourse(client.course_id);
      await result.current.handleBulkValidate({ category: "client", courses: [client] });
    });
    expect(mock.readiness).not.toHaveBeenCalled(); expect(mock.validateSingle).not.toHaveBeenCalled();
    expect(mock.validateBulk).not.toHaveBeenCalled(); expect(result.current.validationReportOk).toBe(0);
  });
  it("does not count a source that transferred out of own scope during the check", async () => {
    mock.readiness.mockImplementationOnce(async target => missing(target)).mockImplementationOnce(async target => ({ ...missing(target), state: "out_of_scope", editionSha256: null }));
    const { result } = mount();
    await act(async () => { await result.current.handleValidateCourse(rows[0].course_id); });
    expect(result.current.validatedCourses[rows[0].course_id]).toBeUndefined();
    expect(result.current.validationReportOk).toBe(0);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled();
  });
  it("does not expose a pass while a readiness response is pending", async () => {
    let finish!: (value: ReturnType<typeof missing>) => void;
    mock.readiness.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = mount(); let request!: Promise<void>;
    act(() => { request = result.current.handleValidateCourse(rows[0].course_id); });
    await waitFor(() => expect(mock.readiness).toHaveBeenCalledOnce());
    expect(result.current.validatedCourses[rows[0].course_id]).toBeUndefined();
    await act(async () => { finish(missing(P.target)); await request; });
    expect(result.current.validatedCourses[rows[0].course_id]).toBe("ok");
  });
  it("invalidates late work on actor loss and does not show its toast", async () => {
    let finish!: (value: ReturnType<typeof missing>) => void;
    mock.readiness.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = mount(); let request!: Promise<void>;
    act(() => { request = result.current.handleValidateCourse(rows[0].course_id); });
    await waitFor(() => expect(mock.readiness).toHaveBeenCalledOnce());
    mock.actor = null; rerender({ courses: rows });
    await act(async () => { finish(missing(P.target)); await request; });
    expect(result.current.validatedCourses).toEqual({}); expect(result.current.validationReportOk).toBe(0);
    expect(mock.toast.info).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });
  it("uses the Simple predicate in own-only sequential bulk without actor TRY self-contention", async () => {
    let inFlight = 0, maximum = 0;
    mock.readiness.mockImplementation(async target => { inFlight++; maximum = Math.max(maximum, inFlight); await Promise.resolve(); inFlight--; return missing(target); });
    const { result } = mount([...rows, row(9, false)]);
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: [...rows, row(9, false)] }); });
    expect(maximum).toBe(1); expect(mock.validateBulk).toHaveBeenCalledTimes(3); expect(mock.validateSingle).not.toHaveBeenCalled();
    expect(result.current.validationReportOk).toBe(3); expect(result.current.publicationReport).toHaveLength(3);
    expect(mock.publish).not.toHaveBeenCalled(); expect(mock.generation).not.toHaveBeenCalled();
  });
  it("keeps partial bulk results exact without an all-ready message", async () => {
    mock.validateBulk.mockImplementation(async id => id === rows[1].course_id ? ["Нет тестов"] : []);
    mock.readiness.mockImplementation(async target => { if (target.courseId === rows[2].course_id) throw new Error("Synthetic unavailable"); return missing(target); });
    const { result } = mount();
    await act(async () => { await result.current.handleBulkValidate({ category: "synthetic", courses: rows }); });
    expect(result.current.validationReportOk).toBe(1);
    expect(result.current.validationReport).toEqual([{ courseId: rows[1].course_id, title: rows[1].course.title, issues: ["Нет тестов"] }]);
    expect(result.current.publicationReport.filter(r => !r.readiness)).toHaveLength(1);
    expect(mock.toast.success).not.toHaveBeenCalled();
  });
  it("publishes only exact gateway-confirmed eligible editions after a fresh Simple structural check", async () => {
    mock.context.mockImplementation(async target => target.courseId === rows[1].course_id
      ? parsedContext({ readiness: readinessDto({ state: "review_missing", review_id: null }) }, target)
      : parsedContext({}, target));
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleBulkPublishReviewed({ category: "synthetic", courses: rows.slice(0, 2) }); });
    expect(mock.publish).toHaveBeenCalledOnce(); expect(mock.validateBulk).toHaveBeenCalledExactlyOnceWith(rows[0].course_id, rules);
    expect(result.current.publishedCount).toBe(1); expect(result.current.publicationReport.map(r => r.published)).toEqual([true, false]);
    expect(fetchData).toHaveBeenCalledOnce(); expect(mock.from).not.toHaveBeenCalled(); expect(mock.generation).not.toHaveBeenCalled();
  });
  it("does not publish an eligible dossier with new structural errors", async () => {
    mock.validateBulk.mockResolvedValueOnce(["Недостаточно занятий"]);
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleBulkPublishReviewed({ category: "synthetic", courses: rows.slice(0, 1) }); });
    expect(mock.publish).not.toHaveBeenCalled(); expect(result.current.publishedCount).toBe(0); expect(fetchData).not.toHaveBeenCalled();
  });
  it("never counts a missing gateway publication readback as a saved row", async () => {
    mock.publish.mockResolvedValueOnce(null);
    const { result, fetchData } = mount();
    await act(async () => { await result.current.handleBulkPublishReviewed({ category: "synthetic", courses: rows.slice(0, 1) }); });
    expect(result.current.publishedCount).toBe(0); expect(result.current.publicationReport[0].published).toBe(false);
    expect(fetchData).not.toHaveBeenCalled(); expect(mock.toast.success).not.toHaveBeenCalled();
  });
});
