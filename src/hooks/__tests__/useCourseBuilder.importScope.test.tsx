import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@/components/course-builder/LessonTypeConfig";

const mocks = vi.hoisted(() => ({
  userId: "actor-a", role: "organization", authLoading: false,
  resolveScope: vi.fn(), invoke: vi.fn(), from: vi.fn(), writes: vi.fn(),
  parseHtml: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId }, userRole: mocks.role, loading: mocks.authLoading }) }));
vi.mock("@/lib/courseImportScope", () => ({ resolveCourseWriteScope: mocks.resolveScope }));
vi.mock("@/hooks/useAiGenerationLimit", () => ({ useAiGenerationLimit: () => ({}), setAiLimitContext: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke, safeFetch: vi.fn() }));
vi.mock("@/utils/courseBuilderHelpers", () => ({ uploadToStorage: vi.fn() }));
vi.mock("@/components/course-builder/block-editor", () => ({
  htmlToBlocks: () => [], blocksToJson: () => "[]", jsonToBlocks: () => [], markdownToBlocks: () => [],
}));
vi.mock("@/utils/htmlCourseParser", () => ({ isHtmlContent: () => false, parseHtmlCourse: mocks.parseHtml }));
vi.mock("@/utils/structuredCourseImport", () => ({ isCszStructuredCourseHtml: () => false }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { importFiles, type CourseBuilderImportContext } from "../useCourseBuilderHelpers";
import { useCourseBuilder } from "../useCourseBuilder";

const orgA = { organizationId: "org-a", source: "current_organization" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function file(name = "1.txt") {
  const result = new File(["Synthetic text"], name, { type: "text/plain" });
  Object.defineProperty(result, "slice", { value: () => ({ text: async () => "Synthetic text" }) });
  Object.defineProperty(result, "text", { value: async () => "Synthetic text" });
  return result;
}
const event = (files = [file()]) => ({ target: { files } }) as unknown as ChangeEvent<HTMLInputElement>;
const parsedReply = (id = "new-lesson") => ({ data: { success: true, courseTitle: "Imported title", lessons: [{ id, title: id, content: "<p>Private synthetic content</p>" }] }, error: null });
function context(overrides: Partial<CourseBuilderImportContext> = {}): CourseBuilderImportContext {
  return { scope: orgA, isCurrent: () => true, verifyBeforeCommit: vi.fn().mockResolvedValue(undefined), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.userId = "actor-a"; mocks.role = "organization"; mocks.authLoading = false;
  mocks.resolveScope.mockResolvedValue(orgA);
  mocks.invoke.mockResolvedValue(parsedReply());
  mocks.parseHtml.mockReturnValue({ title: "Local HTML", description: "Description", lessons: [{ id: "html-lesson", type: "text", title: "HTML", content: "text" }] });
  mocks.from.mockImplementation((table: string) => {
    const response = () => ({ data: table === "courses" ? { id: "course-a", organization_id: "org-a", title: "Existing title" }
      : table === "organizations" ? { subscription_plan: "start" } : [], error: null });
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, not: () => chain, order: () => chain,
      single: async () => response(), maybeSingle: async () => response(),
      then: (done: (value: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(done),
      insert: (...args: unknown[]) => { mocks.writes(table, "insert", ...args); return chain; },
      upsert: (...args: unknown[]) => { mocks.writes(table, "upsert", ...args); return chain; },
      update: (...args: unknown[]) => { mocks.writes(table, "update", ...args); return chain; },
      delete: (...args: unknown[]) => { mocks.writes(table, "delete", ...args); return chain; },
    };
    return chain;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("actual builder import helper scopes every chunk", () => {
  it("includes the verified organization in all three chunks and commits their ordered lessons once", async () => {
    let chunk = 0;
    mocks.invoke.mockImplementation(async () => parsedReply(`chunk-${++chunk}`));
    const title = vi.fn(), description = vi.fn(), lessons = vi.fn();
    const active = context();
    const count = await importFiles([7, 2, 4, 1, 6, 5, 3].map(n => file(`${n}.txt`)), "", title, description, lessons, active);
    expect(count).toBe(3);
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
    for (const [index, [name, options]] of mocks.invoke.mock.calls.entries()) {
      expect(name).toBe("import-course");
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.getAll("organization_id")).toEqual(["org-a"]);
      expect([...options.body.entries()].filter(([key]) => key.startsWith("file_")).map(([, value]) => (value as File).name)).toEqual(index === 0 ? ["1.txt", "2.txt", "3.txt"] : index === 1 ? ["4.txt", "5.txt", "6.txt"] : ["7.txt"]);
    }
    expect(active.verifyBeforeCommit).toHaveBeenCalledTimes(1);
    expect(lessons).toHaveBeenCalledTimes(1);
    expect(lessons.mock.calls[0][0]([]).map((lesson: Lesson) => lesson.id)).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
  });

  it("rejects an empty verified organization before reading files or invoking the parser", async () => {
    await expect(importFiles([file()], "", vi.fn(), vi.fn(), vi.fn(), context({ scope: { ...orgA, organizationId: "" } }))).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("keeps earlier chunks private when the actor changes before the next chunk", async () => {
    let current = true;
    mocks.invoke.mockImplementation(async () => { current = false; return parsedReply(); });
    const title = vi.fn(), description = vi.fn(), lessons = vi.fn();
    await expect(importFiles([1, 2, 3, 4].map(n => file(`${n}.txt`)), "", title, description, lessons, context({ isCurrent: () => current }))).rejects.toThrow();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(title).not.toHaveBeenCalled(); expect(description).not.toHaveBeenCalled(); expect(lessons).not.toHaveBeenCalled();
  });

  it("does not commit parsed HTML when the final fresh tenant verification fails", async () => {
    const title = vi.fn(), description = vi.fn(), lessons = vi.fn();
    await expect(importFiles([file("local.html")], "", title, description, lessons, context({ verifyBeforeCommit: async () => { throw new Error("tenant changed"); } }))).rejects.toThrow("tenant changed");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(title).not.toHaveBeenCalled(); expect(description).not.toHaveBeenCalled(); expect(lessons).not.toHaveBeenCalled();
  });
});

async function ready() {
  const hook = renderHook(() => useCourseBuilder("course-a"));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.organizationId).toBe("org-a");
  return hook;
}
function expectNoImportedState(hook: Awaited<ReturnType<typeof ready>>) {
  expect(hook.result.current.lessons).toEqual([]);
  expect(hook.result.current.hasUnsavedChanges).toBe(false);
  expect(mocks.writes).not.toHaveBeenCalled();
}

describe("actual builder hook rechecks current import authority", () => {
  it("does not invoke or mutate while the initial scope is pending", async () => {
    const pending = deferred<typeof orgA>(); mocks.resolveScope.mockReturnValue(pending.promise);
    const hook = renderHook(() => useCourseBuilder("course-a"));
    await waitFor(() => expect(mocks.resolveScope).toHaveBeenCalledTimes(1));
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
    await act(async () => { pending.resolve(orgA); });
  });

  it("does not invoke or mutate after the initial scope failed", async () => {
    mocks.resolveScope.mockRejectedValue(new Error("permission unavailable"));
    const hook = renderHook(() => useCourseBuilder("course-a"));
    await waitFor(() => expect(hook.result.current.scopeError).toBe("permission unavailable"));
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
  });

  it.each(["denied", "error"])("does not import when the fresh current-scope check is %s", async reason => {
    const hook = await ready();
    mocks.resolveScope.mockRejectedValueOnce(new Error(reason));
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.resolveScope).toHaveBeenLastCalledWith({ userId: "actor-a", userRole: "organization", requestedOrganizationId: "org-a" });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
  });

  it("does not import while authentication is pending", async () => {
    const hook = await ready(); mocks.authLoading = true; hook.rerender();
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
  });

  it("rejects a freshly resolved tenant different from the loaded editor", async () => {
    const hook = await ready(); mocks.resolveScope.mockResolvedValue({ ...orgA, organizationId: "org-b" });
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
  });

  it.each([false, true])("ignores a pending authorization after actor A changes %s-back to A", async backToA => {
    const hook = await ready(); const pending = deferred<typeof orgA>();
    mocks.resolveScope.mockReturnValueOnce(pending.promise);
    let work!: Promise<void>;
    act(() => { work = hook.result.current.handleFileImport(event()); });
    mocks.userId = "actor-b"; hook.rerender();
    if (backToA) { mocks.userId = "actor-a"; hook.rerender(); }
    await act(async () => { pending.resolve(orgA); await work; });
    expect(mocks.invoke).not.toHaveBeenCalled(); expectNoImportedState(hook);
  });

  it("ignores an old parser response after authentication changes", async () => {
    const hook = await ready(); const pending = deferred<ReturnType<typeof parsedReply>>();
    mocks.invoke.mockReturnValueOnce(pending.promise);
    let work!: Promise<void>;
    act(() => { work = hook.result.current.handleFileImport(event()); });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    mocks.userId = "actor-b"; hook.rerender();
    await act(async () => { pending.resolve(parsedReply()); await work; });
    expectNoImportedState(hook); expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("rejects a tenant change during parsing before editor state is committed", async () => {
    const hook = await ready();
    mocks.resolveScope.mockResolvedValueOnce(orgA).mockResolvedValueOnce({ ...orgA, organizationId: "org-b" });
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1); expectNoImportedState(hook);
  });

  it("persists the imported lesson through the existing debounce when current authority remains confirmed", async () => {
    const hook = await ready(); vi.useFakeTimers();
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(hook.result.current.lessons).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(mocks.writes).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const persisted = mocks.writes.mock.calls.filter(([table, operation]) => table === "lessons" && operation === "upsert");
    expect(persisted).toHaveLength(1);
    expect(persisted[0][2]).toEqual([expect.objectContaining({
      id: "new-lesson", course_id: "course-a", title: "new-lesson", type: "text", content: "[]",
    })]);
    expect(mocks.resolveScope).toHaveBeenCalledTimes(4);
    expect(hook.result.current.autoSaveStatus).toBe("saved");
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
  });

  it("rechecks an admin-view tenant at autosave time and performs no write when it changed after parsing", async () => {
    mocks.role = "admin";
    const hook = await ready(); vi.useFakeTimers();
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    expect(hook.result.current.lessons).toHaveLength(1);
    expect(hook.result.current.hasUnsavedChanges).toBe(true);
    mocks.resolveScope.mockRejectedValueOnce(new Error("admin view tenant changed"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.resolveScope).toHaveBeenCalledTimes(4);
    expect(mocks.writes).not.toHaveBeenCalled();
    expect(hook.result.current.autoSaveStatus).toBe("error");
  });

  it("does not write when authentication changes during the autosave authority check", async () => {
    const hook = await ready(); vi.useFakeTimers();
    await act(async () => { await hook.result.current.handleFileImport(event()); });
    const pending = deferred<typeof orgA>(); mocks.resolveScope.mockReturnValueOnce(pending.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    mocks.userId = "actor-b"; hook.rerender();
    await act(async () => { pending.resolve(orgA); });
    expect(mocks.writes).not.toHaveBeenCalled();
  });
});
