import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@/components/course-builder/LessonTypeConfig";

interface Query { table: string; operation: string; columns?: string; payload?: any; filters: Record<string, unknown>; terminal?: string }
const mocks = vi.hoisted(() => ({
  actor: "actor-a", role: "organization", loading: false,
  from: vi.fn(), scope: vi.fn(), navigate: vi.fn(), respond: vi.fn(), queries: [] as Query[],
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useParams: () => ({}) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor }, userRole: mocks.role, loading: mocks.loading }) }));
vi.mock("@/lib/courseImportScope", () => ({ resolveCourseWriteScope: mocks.scope }));
vi.mock("@/hooks/useAiGenerationLimit", () => ({ useAiGenerationLimit: () => ({}), setAiLimitContext: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn(), safeFetch: vi.fn() }));
vi.mock("@/utils/courseBuilderHelpers", () => ({ uploadToStorage: vi.fn() }));
vi.mock("@/utils/htmlCourseParser", () => ({ isHtmlContent: () => false, parseHtmlCourse: vi.fn() }));
vi.mock("@/utils/structuredCourseImport", () => ({ isCszStructuredCourseHtml: () => false }));
vi.mock("@/components/course-builder/block-editor", () => ({
  htmlToBlocks: () => [], markdownToBlocks: () => [], blocksToJson: JSON.stringify,
  jsonToBlocks: (raw: string) => JSON.parse(raw),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { useCourseBuilder } from "../useCourseBuilder";

function deferred<T = any>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const ok = (data: any = null) => ({ data, error: null });
const lessonId = (course: string) => `${course}-lesson`;
function metadata(course: string) {
  return { id: lessonId(course), course_id: course, title: `Lesson ${course}`, type: "text", order_index: 0, module_id: "module-a", metadata: {} };
}
function defaultReply(query: Query): any {
  const course = String(query.filters.course_id ?? query.filters.id ?? "course-a");
  if (query.table === "courses") {
    if (query.operation === "insert") return ok({ id: "created-a", ...query.payload });
    return ok({ id: query.filters.id, organization_id: "org-a", title: `Title ${query.filters.id}`, description: "", ...query.payload });
  }
  if (query.table === "organizations") return ok({ subscription_plan: "start" });
  if (query.table === "lessons" && query.operation === "select") {
    if (query.columns === "id, course_id" && Array.isArray(query.filters.id)) return ok([]);
    if (query.terminal === "maybeSingle") return ok({ id: query.filters.id, course_id: query.filters.course_id, content: '[{"id":"block-a","type":"paragraph","content":"Server body"}]' });
    return ok([metadata(course)]);
  }
  return ok(query.operation === "select" ? [] : null);
}
function installQueries() {
  mocks.from.mockImplementation((table: string) => {
    const query: Query = { table, operation: "select", filters: {} };
    let result: Promise<any> | undefined;
    const execute = (terminal: string) => {
      query.terminal = terminal;
      if (!result) { mocks.queries.push(query); result = Promise.resolve().then(() => mocks.respond(query)); }
      return result;
    };
    const chain: any = {
      select: (columns?: string) => { query.columns = columns; return chain; },
      eq: (key: string, value: unknown) => { query.filters[key] = value; return chain; },
      in: (key: string, value: unknown) => { query.filters[key] = value; return chain; },
      not: (key: string, operator: string, value: unknown) => { query.filters[`not:${key}:${operator}`] = value; return chain; },
      order: () => chain,
      insert: (payload: unknown) => { query.operation = "insert"; query.payload = payload; return chain; },
      update: (payload: unknown) => { query.operation = "update"; query.payload = payload; return chain; },
      upsert: (payload: unknown) => { query.operation = "upsert"; query.payload = payload; return chain; },
      delete: () => { query.operation = "delete"; return chain; },
      single: () => execute("single"), maybeSingle: () => execute("maybeSingle"),
      then: (done: any, fail: any) => execute("then").then(done, fail),
    };
    return chain;
  });
}
const contentReads = () => mocks.queries.filter(q => q.table === "lessons" && q.terminal === "maybeSingle");
const writes = () => mocks.queries.filter(q => q.operation !== "select");
async function ready(id: string | null = "course-a") {
  const hook = renderHook(({ course }) => useCourseBuilder(course), { initialProps: { course: id ?? undefined } });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.scopeError).toBeNull();
  return hook;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.queries = [];
  mocks.actor = "actor-a"; mocks.role = "organization"; mocks.loading = false;
  mocks.scope.mockResolvedValue({ organizationId: "org-a", source: "current_organization" });
  mocks.respond.mockImplementation(defaultReply); installQueries();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("actual builder main and lazy requests keep their requested identity", () => {
  it("does not apply an old main fetch after B is ready, including return to A", async () => {
    const pending = deferred(); let first = true;
    mocks.respond.mockImplementation(q => q.table === "courses" && q.filters.id === "course-a" && first ? (first = false, pending.promise) : defaultReply(q));
    const hook = renderHook(({ course }) => useCourseBuilder(course), { initialProps: { course: "course-a" } });
    await waitFor(() => expect(mocks.queries.some(q => q.table === "courses")).toBe(true));
    hook.rerender({ course: "course-b" });
    expect(hook.result.current.courseTitle).toBe("");
    await waitFor(() => expect(hook.result.current.courseTitle).toBe("Title course-b"));
    hook.rerender({ course: "course-a" });
    await waitFor(() => expect(hook.result.current.courseTitle).toBe("Title course-a"));
    await act(async () => { pending.resolve(ok({ id: "course-a", organization_id: "org-a", title: "OLD PRIVATE TITLE" })); });
    expect(hook.result.current.courseTitle).toBe("Title course-a");
    expect(hook.result.current.lessons[0].id).toBe("course-a-lesson");
  });

  it("deduplicates pending content and scopes the actual row query by lesson AND course", async () => {
    const pending = deferred(); mocks.respond.mockImplementation(q => q.table === "lessons" && q.terminal === "maybeSingle" ? pending.promise : defaultReply(q));
    const hook = await ready(); let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = hook.result.current.loadLessonContent(lessonId("course-a")); second = hook.result.current.loadLessonContent(lessonId("course-a")); });
    expect(first).toBe(second);
    await waitFor(() => expect(contentReads()).toHaveLength(1));
    expect(contentReads()[0]).toMatchObject({ columns: "id, course_id, content", filters: { id: "course-a-lesson", course_id: "course-a" } });
    expect(hook.result.current.lessons[0].__contentLoaded).toBe(false);
    await act(async () => { pending.resolve(ok({ id: "course-a-lesson", course_id: "course-a", content: "[]" })); await first; });
    expect(hook.result.current.lessons[0]).toMatchObject({ content: "[]", __contentLoaded: true });
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
  });

  it.each(["missing", "error", "wrong-course", "wrong-id"])("keeps %s as an unknown placeholder and allows an explicit retry", async kind => {
    let reads = 0;
    mocks.respond.mockImplementation(q => {
      if (q.table !== "lessons" || q.terminal !== "maybeSingle") return defaultReply(q);
      if (++reads > 1) return ok({ id: q.filters.id, course_id: "course-a", content: null });
      if (kind === "missing") return ok(null);
      if (kind === "error") return { data: null, error: { message: "Unavailable" } };
      if (kind === "wrong-id") return ok({ id: "foreign-lesson", course_id: "course-a", content: "PRIVATE" });
      return ok({ id: q.filters.id, course_id: "course-foreign", content: "PRIVATE" });
    });
    const hook = await ready();
    await act(async () => { await hook.result.current.loadLessonContent("course-a-lesson"); });
    expect(hook.result.current.lessons[0]).toMatchObject({ content: "", __contentLoaded: false });
    expect(hook.result.current.lessonContentStatus["course-a-lesson"]).toBe(kind === "missing" ? "missing" : "error");
    await act(async () => { await hook.result.current.loadLessonContent("course-a-lesson"); });
    expect(contentReads()).toHaveLength(2);
    expect(hook.result.current.lessons[0]).toMatchObject({ content: "", __contentLoaded: true });
  });

  it("preserves a metadata edit and rejects direct or bulk placeholder content promotion", async () => {
    const pending = deferred(); mocks.respond.mockImplementation(q => q.table === "lessons" && q.terminal === "maybeSingle" ? pending.promise : defaultReply(q));
    const hook = await ready(); let load!: Promise<void>;
    act(() => { load = hook.result.current.loadLessonContent("course-a-lesson"); });
    await waitFor(() => expect(contentReads()).toHaveLength(1));
    act(() => { hook.result.current.updateLesson("course-a-lesson", { title: "Edited title" }); hook.result.current.updateLesson("course-a-lesson", { content: "LOCAL EMPTY REPLACEMENT" }); });
    act(() => { hook.result.current.setLessons(rows => rows.map(row => ({ ...row, __contentLoaded: true, content: "BULK" }))); });
    expect(hook.result.current.lessons[0]).toMatchObject({ title: "Edited title", content: "", __contentLoaded: false });
    await act(async () => { pending.resolve(ok({ id: "course-a-lesson", course_id: "course-a", content: "[]" })); await load; });
    expect(hook.result.current.lessons[0]).toMatchObject({ title: "Edited title", content: "[]", __contentLoaded: true });
  });

  it.each(["course", "actor", "ABA", "unmount"])("ignores old pending lesson content after %s transition", async transition => {
    const pending = deferred(); mocks.respond.mockImplementation(q => q.table === "lessons" && q.terminal === "maybeSingle" ? pending.promise : defaultReply(q));
    const hook = await ready(); let load!: Promise<void>;
    act(() => { load = hook.result.current.loadLessonContent("course-a-lesson"); });
    await waitFor(() => expect(contentReads()).toHaveLength(1));
    if (transition === "actor") { mocks.actor = "actor-b"; hook.rerender({ course: "course-a" }); }
    else if (transition === "unmount") hook.unmount();
    else { hook.rerender({ course: "course-b" }); if (transition === "ABA") hook.rerender({ course: "course-a" }); }
    if (transition !== "unmount") await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { pending.resolve(ok({ id: "course-a-lesson", course_id: "course-a", content: "OLD PRIVATE BODY" })); await load; });
    if (transition !== "unmount") expect(hook.result.current.lessons.every(row => row.content !== "OLD PRIVATE BODY" && row.__contentLoaded === false)).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("does not query new local lessons, and refuses single-lesson save for placeholders", async () => {
    const hook = await ready();
    await act(async () => { expect(await hook.result.current.saveSingleLesson(hook.result.current.lessons[0], 0)).toBe(false); });
    act(() => hook.result.current.addLesson("text"));
    const local = hook.result.current.lessons[hook.result.current.lessons.length - 1];
    await act(async () => { await hook.result.current.loadLessonContent(local.id); });
    expect(local.__contentLoaded).toBeUndefined(); expect(contentReads()).toEqual([]); expect(writes()).toEqual([]);
  });

  it.each(["before query", "after query"])("does not expose lesson content when fresh scope fails %s", async phase => {
    const hook = await ready();
    if (phase === "after query") mocks.scope.mockResolvedValueOnce({ organizationId: "org-a" });
    mocks.scope.mockRejectedValueOnce(new Error("Current authority unavailable"));
    await act(async () => { await hook.result.current.loadLessonContent("course-a-lesson"); });
    expect(contentReads()).toHaveLength(phase === "before query" ? 0 : 1);
    expect(hook.result.current.lessons[0]).toMatchObject({ content: "", __contentLoaded: false });
    expect(hook.result.current.lessonContentStatus["course-a-lesson"]).toBe("error");
  });
});

describe("manual ambiguity resolution reads only exact attempted new IDs", () => {
  async function ambiguous() {
    const hook = await ready(); act(() => hook.result.current.addLesson("text"));
    const id = hook.result.current.lessons[1].id;
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.operation === "upsert" && q.payload[0].id === id
      ? Promise.reject(new Error("AbortError: acknowledgement lost")) : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(false); });
    act(() => hook.result.current.deleteLesson(id));
    return { hook, id };
  }
  const ambiguityRead = (q: Query) => q.table === "lessons" && q.operation === "select" && q.columns === "id, course_id" && Array.isArray(q.filters.id);

  it.each([true, false])("resolves remotely committed=%s without discovering or deleting an unseen row", async committed => {
    const { hook, id } = await ambiguous(); const server = new Set(["course-a-lesson", "unseen-other-session", ...(committed ? [id] : [])]);
    mocks.respond.mockImplementation(q => {
      if (ambiguityRead(q)) {
        expect(q.filters).toEqual({ course_id: "course-a", id: [id] });
        return ok((q.filters.id as string[]).filter(value => server.has(value)).map(value => ({ id: value, course_id: "course-a" })));
      }
      if (q.table === "lessons" && q.operation === "delete") for (const value of q.filters.id as string[]) server.delete(value);
      return defaultReply(q);
    });
    const countBefore = writes().length;
    await act(async () => { expect(await hook.result.current.saveCourse(true, false)).toBe(false); });
    expect(writes()).toHaveLength(countBefore); expect(mocks.queries.filter(ambiguityRead)).toHaveLength(0);
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(mocks.queries.filter(ambiguityRead)).toHaveLength(1);
    expect(server).toEqual(new Set(["course-a-lesson", "unseen-other-session"]));
    expect(writes().filter(q => q.operation === "delete").map(q => q.filters.id)).toEqual(committed ? [[id]] : []);
  });

  it.each(["error", "wrong course", "unexpected ID", "authority"])("retains ambiguity and all dirty data after a scoped read %s", async failure => {
    const { hook, id } = await ambiguous(); const countBefore = writes().length;
    if (failure === "authority") mocks.scope.mockResolvedValueOnce({ organizationId: "org-a" }).mockRejectedValueOnce(new Error("Authority unavailable"));
    mocks.respond.mockImplementation(q => ambiguityRead(q) ? failure === "error" ? { data: null, error: { message: "Unavailable" } }
      : ok([{ id: failure === "unexpected ID" ? "unseen-other-session" : id, course_id: failure === "wrong course" ? "foreign" : "course-a" }]) : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(false); });
    expect(writes()).toHaveLength(countBefore); expect(hook.result.current.hasUnsavedChanges).toBe(true); expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.respond.mockImplementation(q => ambiguityRead(q) ? ok([{ id, course_id: "course-a" }]) : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(mocks.queries.filter(ambiguityRead)).toHaveLength(2);
    expect(writes().filter(q => q.operation === "delete").map(q => q.filters.id)).toEqual([[id]]);
  });

  it("starts no writes after an actor change while the exact-ID ambiguity read is pending", async () => {
    const { hook, id } = await ambiguous(); const pending = deferred(); const countBefore = writes().length;
    mocks.respond.mockImplementation(q => ambiguityRead(q) ? pending.promise : defaultReply(q));
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveCourse(true); });
    await waitFor(() => expect(mocks.queries.filter(ambiguityRead)).toHaveLength(1));
    mocks.actor = "actor-b"; hook.rerender({ course: "course-a" }); await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { pending.resolve(ok([{ id, course_id: "course-a" }])); expect(await save).toBe(false); });
    expect(writes()).toHaveLength(countBefore); expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});

describe("actual confirmed save keeps dirty drafts on uncertain or stale results", () => {
  it.each(["AbortError", "batch-error", "rejected", "subrecord-error"])("returns false for %s without success, exit or legacy clear", async failure => {
    const hook = await ready(); const legacy = '{"title":"unattributed"}'; localStorage.setItem("course_draft_course-a", legacy);
    act(() => { hook.result.current.updateLesson("course-a-lesson", { title: "Changed metadata", ...(failure === "subrecord-error" ? { type: "test", questions: [{ id: "q-a", question: "Q", options: [{ text: "A" }], correct_answer: 0, order_index: 0 }] } : {}) }); });
    // Test-specific subrecord uses an explicitly loaded local test, never promotes a placeholder.
    if (failure === "subrecord-error") act(() => { hook.result.current.addLesson("test", null, { questions: [{ id: "q-a", question: "Q", options: [{ text: "A" }], correct_answer: 0, order_index: 0 }] }); });
    mocks.respond.mockImplementation(q => {
      if (q.operation === "upsert" && q.table === (failure === "subrecord-error" ? "test_questions" : "lessons")) {
        if (failure === "rejected") return Promise.reject(new Error("Network"));
        return { data: null, error: { message: failure === "AbortError" ? "AbortError: uncertain transport" : "Denied" } };
      }
      return defaultReply(q);
    });
    await act(async () => { await hook.result.current.handleSaveAndExit(); });
    expect(hook.result.current.hasUnsavedChanges).toBe(true); expect(hook.result.current.autoSaveStatus).toBe("error");
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem("course_draft_course-a")).toBe(legacy);
    expect(Object.keys(localStorage).some(key => key.startsWith("course_builder_draft_v2:"))).toBe(true);
  });

  it("retains dirty newer edits instead of reporting success or clearing their draft", async () => {
    const hook = await ready(); const pending = deferred();
    mocks.respond.mockImplementation(q => q.table === "courses" && q.operation === "update" ? pending.promise : defaultReply(q));
    act(() => { hook.result.current.setCourseTitle("Saved snapshot"); hook.result.current.markAsChanged(); });
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveCourse(true); });
    await waitFor(() => expect(writes().some(q => q.table === "courses")).toBe(true));
    act(() => { hook.result.current.setCourseTitle("Newer title"); hook.result.current.markAsChanged(); });
    await act(async () => { pending.resolve(ok({ id: "course-a", organization_id: "org-a" })); expect(await save).toBe(false); });
    expect(hook.result.current.courseTitle).toBe("Newer title"); expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(mocks.toast.success).not.toHaveBeenCalled(); expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("stops subsequent write phases after a context transition during head save", async () => {
    const hook = await ready(); const pending = deferred();
    mocks.respond.mockImplementation(q => q.table === "courses" && q.operation === "update" ? pending.promise : defaultReply(q));
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveCourse(); });
    await waitFor(() => expect(writes()).toHaveLength(1));
    hook.rerender({ course: "course-b" }); await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { pending.resolve(ok({ id: "course-a", organization_id: "org-a" })); expect(await save).toBe(false); });
    expect(writes()).toHaveLength(1); expect(mocks.toast.success).not.toHaveBeenCalled(); expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps a new ID origin-bound after partial failure and reuses it only for same-context retry", async () => {
    const hook = await ready(null); let fail = true;
    act(() => { hook.result.current.setCourseTitle("New course"); hook.result.current.markAsChanged(); hook.result.current.addLesson("text"); });
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.operation === "upsert" && fail ? { data: null, error: { message: "AbortError" } } : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
    expect(hook.result.current.courseId).toBe("created-a"); expect(mocks.navigate).not.toHaveBeenCalled();
    fail = false;
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    expect(writes().filter(q => q.table === "courses" && q.operation === "insert")).toHaveLength(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/course-builder/created-a", { replace: true });
    hook.rerender({ course: "created-a" });
    expect(hook.result.current.courseTitle).toBe("New course");
    hook.rerender({ course: "course-b" });
    expect(hook.result.current.courseId).toBe("course-b"); expect(hook.result.current.courseTitle).toBe("");
    await waitFor(() => expect(hook.result.current.courseTitle).toBe("Title course-b"));
  });

  it("keeps unknown lesson content out of upserts while saving metadata", async () => {
    const hook = await ready(); act(() => hook.result.current.updateLesson("course-a-lesson", { title: "Metadata only" }));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    const batch = writes().find(q => q.table === "lessons" && q.operation === "upsert")!;
    expect(batch.payload).toEqual([expect.objectContaining({ id: "course-a-lesson", title: "Metadata only", course_id: "course-a" })]);
    expect(batch.payload[0]).not.toHaveProperty("content");
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
    expect(hook.result.current.getCommittedCourseId()).toBe("course-a");
    act(() => hook.result.current.updateLesson("course-a-lesson", { title: "New unsaved change" }));
    expect(hook.result.current.getCommittedCourseId()).toBeNull();
  });

  it("rebinds future drafts to the exact successfully adopted new-course route", async () => {
    const hook = await ready(null);
    act(() => { hook.result.current.setCourseTitle("New course"); hook.result.current.markAsChanged(); });
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    hook.rerender({ course: "created-a" });
    act(() => { hook.result.current.setCourseTitle("Edit after adoption"); hook.result.current.markAsChanged(); });
    const snapshots = Object.keys(localStorage).filter(key => key.startsWith("course_builder_draft_v2:")).map(key => JSON.parse(localStorage.getItem(key)!));
    expect(snapshots).toContainEqual(expect.objectContaining({ actorId: "actor-a", organizationId: "org-a", requestedCourseId: "created-a", courseId: "created-a", title: "Edit after adoption" }));
    expect(snapshots.some(draft => draft.requestedCourseId === null && draft.title === "Edit after adoption")).toBe(false);
  });

  it("does not release the save lock while a sibling write batch is still pending", async () => {
    const hook = await ready(); const pending = deferred();
    act(() => hook.result.current.addLesson("text"));
    mocks.respond.mockImplementation(q => {
      if (q.table === "lessons" && q.operation === "upsert") return q.payload[0].content !== undefined
        ? Promise.reject(new Error("AbortError")) : pending.promise;
      return defaultReply(q);
    });
    let first!: Promise<boolean>; act(() => { first = hook.result.current.saveCourse(true); });
    await waitFor(() => expect(writes().filter(q => q.operation === "upsert")).toHaveLength(2));
    expect(hook.result.current.isSaving).toBe(true);
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(false); });
    expect(writes().filter(q => q.table === "courses" && q.operation === "update")).toHaveLength(1);
    await act(async () => { pending.resolve(ok()); expect(await first).toBe(false); });
    expect(hook.result.current.isSaving).toBe(false); expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("does not write a captured single-lesson snapshot after a newer local edit", async () => {
    const hook = await ready();
    act(() => hook.result.current.addLesson("text"));
    const local = hook.result.current.lessons[hook.result.current.lessons.length - 1];
    const pending = deferred();
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.terminal === "maybeSingle" ? pending.promise : defaultReply(q));
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveSingleLesson(local, 1); });
    await waitFor(() => expect(contentReads()).toHaveLength(1));
    act(() => hook.result.current.updateLesson(local.id, { content: "New local content" }));
    await act(async () => { pending.resolve(ok(null)); expect(await save).toBe(false); });
    expect(writes()).toEqual([]); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(hook.result.current.lessons[1].content).toBe("New local content");
  });

  it("remembers an acknowledged single write even when a newer edit prevents overall success", async () => {
    const hook = await ready(); act(() => hook.result.current.addLesson("text"));
    const local = hook.result.current.lessons[1]; const pending = deferred();
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.terminal === "maybeSingle" ? ok(null)
      : q.table === "lessons" && q.operation === "insert" ? pending.promise : defaultReply(q));
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveSingleLesson(local, 1); });
    await waitFor(() => expect(writes().some(q => q.table === "lessons" && q.operation === "insert")).toBe(true));
    act(() => hook.result.current.updateLesson(local.id, { content: "New edit" }));
    await act(async () => { pending.resolve(ok({ id: local.id, course_id: "course-a" })); expect(await save).toBe(false); });
    act(() => hook.result.current.deleteLesson(local.id)); mocks.respond.mockImplementation(defaultReply);
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(writes().filter(q => q.operation === "delete").map(q => q.filters.id)).toEqual([[local.id]]);
  });
});

describe("save deletion reconciles only the exact known lesson baseline", () => {
  it("deletes the last known lesson explicitly and preserves an unseen concurrently added row", async () => {
    const server = new Set(["course-a-lesson"]);
    mocks.respond.mockImplementation(q => {
      if (q.table === "lessons" && q.operation === "delete") {
        expect(q.filters.course_id).toBe("course-a"); expect(q.filters.id).toEqual(["course-a-lesson"]);
        expect(q.filters).not.toHaveProperty("not:id:in");
        for (const id of q.filters.id as string[]) server.delete(id);
      }
      return defaultReply(q);
    });
    const hook = await ready(); server.add("unseen-concurrent-lesson");
    act(() => hook.result.current.deleteLesson("course-a-lesson"));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(server).toEqual(new Set(["unseen-concurrent-lesson"]));
    expect(writes().filter(q => q.table === "lessons" && q.operation === "delete")).toHaveLength(1);
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(writes().filter(q => q.table === "lessons" && q.operation === "delete")).toHaveLength(1);
  });

  it("deletes only missing known IDs when the saved list is nonempty", async () => {
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.operation === "select" && q.terminal !== "maybeSingle"
      ? ok([metadata("course-a"), { ...metadata("course-a"), id: "known-b" }]) : defaultReply(q));
    const hook = await ready();
    act(() => hook.result.current.deleteLesson("course-a-lesson"));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(writes().filter(q => q.operation === "delete")).toEqual([expect.objectContaining({
      table: "lessons", filters: { course_id: "course-a", id: ["course-a-lesson"] },
    })]);
    const batch = writes().find(q => q.operation === "upsert")!;
    expect(batch.payload.map((row: any) => row.id)).toEqual(["known-b"]);
  });

  it("does not infer a deletion while the initial server baseline is unknown", async () => {
    const pending = deferred(); mocks.respond.mockImplementation(q => q.table === "courses" ? pending.promise : defaultReply(q));
    const hook = renderHook(() => useCourseBuilder("course-a"));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
    expect(writes()).toEqual([]);
    hook.unmount(); pending.resolve(ok({ id: "course-a", organization_id: "org-a", title: "Old" }));
  });

  it("retains removal intent and dirty state after a failed exact-ID deletion", async () => {
    const hook = await ready();
    act(() => hook.result.current.deleteLesson("course-a-lesson"));
    mocks.respond.mockImplementation(q => q.operation === "delete" ? { data: null, error: { message: "Unavailable" } } : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
    expect(hook.result.current.lessons).toEqual([]); expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    mocks.respond.mockImplementation(defaultReply);
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    expect(writes().filter(q => q.operation === "delete").map(q => q.filters.id)).toEqual([["course-a-lesson"], ["course-a-lesson"]]);
  });

  it("starts no later write phase or success callback after an old exact-ID delete returns", async () => {
    const hook = await ready(); const pending = deferred();
    act(() => hook.result.current.deleteLesson("course-a-lesson"));
    mocks.respond.mockImplementation(q => q.operation === "delete" ? pending.promise : defaultReply(q));
    let save!: Promise<boolean>; act(() => { save = hook.result.current.saveCourse(); });
    await waitFor(() => expect(writes().filter(q => q.operation === "delete")).toHaveLength(1));
    hook.rerender({ course: "course-b" }); await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => { pending.resolve(ok()); expect(await save).toBe(false); });
    expect(writes().map(q => [q.table, q.operation])).toEqual([["courses", "update"], ["lessons", "delete"]]);
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(hook.result.current.lessons[0].id).toBe("course-b-lesson"); expect(hook.result.current.hasUnsavedChanges).toBe(false);
  });

  it("remembers a successful new-row batch when its sibling fails before a later removal", async () => {
    const hook = await ready(); act(() => hook.result.current.addLesson("text"));
    const localId = hook.result.current.lessons[1].id;
    mocks.respond.mockImplementation(q => q.table === "lessons" && q.operation === "upsert" && q.payload[0].content === undefined
      ? { data: null, error: { message: "Metadata batch denied" } } : defaultReply(q));
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(false); });
    act(() => hook.result.current.deleteLesson(localId)); mocks.respond.mockImplementation(defaultReply);
    await act(async () => { expect(await hook.result.current.saveCourse(true)).toBe(true); });
    expect(writes().filter(q => q.operation === "delete").map(q => q.filters.id)).toEqual([[localId]]);
  });
});
