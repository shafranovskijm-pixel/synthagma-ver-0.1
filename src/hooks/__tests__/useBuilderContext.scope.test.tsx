import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useBuilderContext, useBuilderState } from "../course-builder/useBuilderContext";

interface Identity {
  actorId: string | undefined;
  role: string | null;
  loading: boolean;
  courseId: string | undefined;
}
const identity = (changes: Partial<Identity> = {}): Identity => ({
  actorId: "actor-a", role: "organization", loading: false, courseId: "course-a", ...changes,
});

function useEditor(input: Identity, renderWitness?: (value: { courseId: string | undefined; title: string; dirty: boolean }) => void) {
  const context = useBuilderContext(input.actorId, input.role, input.loading, input.courseId);
  const [title, setTitle] = useBuilderState(context, "");
  const [dirty, setDirty] = useBuilderState(context, false);
  const [lessonIds, setLessonIds] = useBuilderState<string[]>(context, () => []);
  renderWitness?.({ courseId: input.courseId, title, dirty });
  return { context, title, setTitle, dirty, setDirty, lessonIds, setLessonIds };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(cleanup);

describe("builder state belongs to one actor and requested route lifetime", () => {
  it("keeps ordinary rerenders in the same lifetime and applies consecutive functional edits", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity() } });
    const original = hook.result.current.context;
    act(() => {
      hook.result.current.setTitle("Course A");
      hook.result.current.setDirty(true);
      hook.result.current.setLessonIds(previous => [...previous, "lesson-1"]);
      hook.result.current.setLessonIds(previous => [...previous, "lesson-2"]);
    });
    hook.rerender({ input: identity() });
    expect(hook.result.current.context).toBe(original);
    expect(original.isCurrent()).toBe(true);
    expect(hook.result.current.title).toBe("Course A");
    expect(hook.result.current.dirty).toBe(true);
    expect(hook.result.current.lessonIds).toEqual(["lesson-1", "lesson-2"]);
  });

  it("masks A's fields in B's first render before effects can load B", () => {
    const renders: Array<{ courseId: string | undefined; title: string; dirty: boolean }> = [];
    const hook = renderHook(({ input }) => useEditor(input, value => { renders.push(value); }), {
      initialProps: { input: identity() },
    });
    act(() => { hook.result.current.setTitle("Private A title"); hook.result.current.setDirty(true); });
    const boundary = renders.length;
    hook.rerender({ input: identity({ courseId: "course-b" }) });
    expect(renders[boundary]).toEqual({ courseId: "course-b", title: "", dirty: false });
    expect(hook.result.current.lessonIds).toEqual([]);
  });

  it.each([false, true])("rejects an old deferred completion after A→B, with return to A = %s", async returnToA => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity() } });
    const first = hook.result.current;
    const pending = deferred<string>();
    const oldWork = pending.promise.then(value => {
      first.setTitle(value);
      first.setDirty(true);
      first.setLessonIds(previous => [...previous, "old-lesson"]);
    });
    hook.rerender({ input: identity({ courseId: "course-b" }) });
    const second = hook.result.current.context;
    if (returnToA) hook.rerender({ input: identity() });
    act(() => { hook.result.current.setTitle("Current title"); });
    await act(async () => { pending.resolve("Late A title"); await oldWork; });
    expect(first.context.isCurrent()).toBe(false);
    expect(first.context).not.toBe(hook.result.current.context);
    expect(hook.result.current.context.generation).toBeGreaterThan(first.context.generation);
    expect(hook.result.current.context.isCurrent()).toBe(true);
    if (returnToA) expect(second.isCurrent()).toBe(false);
    expect(hook.result.current.title).toBe("Current title");
    expect(hook.result.current.dirty).toBe(false);
    expect(hook.result.current.lessonIds).toEqual([]);
  });

  it.each([
    ["actor", { actorId: "actor-b" }],
    ["role", { role: "teacher" }],
    ["authentication pending", { loading: true }],
    ["signed out", { actorId: undefined, role: null }],
  ] satisfies Array<[string, Partial<Identity>]>) ("rejects captured setters after %s changes", (_label, changes) => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity() } });
    const old = hook.result.current;
    act(() => { old.setTitle("Actor A document"); old.setDirty(true); });
    hook.rerender({ input: identity(changes) });
    act(() => { old.setTitle("Late document"); old.setDirty(true); });
    expect(old.context.isCurrent()).toBe(false);
    expect(hook.result.current.title).toBe("");
    expect(hook.result.current.dirty).toBe(false);
    expect(hook.result.current.lessonIds).toEqual([]);
  });

  it("does not revive a captured actor A lifetime after actor A→B→A", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity() } });
    const old = hook.result.current;
    hook.rerender({ input: identity({ actorId: "actor-b" }) });
    hook.rerender({ input: identity() });
    act(() => { old.setTitle("Stale actor A document"); });
    expect(old.context.isCurrent()).toBe(false);
    expect(hook.result.current.context).not.toBe(old.context);
    expect(hook.result.current.title).toBe("");
  });

  it.each([
    { actorId: undefined },
    { role: null },
    { loading: true },
  ] satisfies Array<Partial<Identity>>)("does not accept edits without ready authentication: %j", changes => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity(changes) } });
    const pending = hook.result.current;
    expect(pending.context.isCurrent()).toBe(false);
    act(() => { pending.setTitle("Blocked edit"); pending.setDirty(true); });
    expect(hook.result.current.title).toBe("");
    expect(hook.result.current.dirty).toBe(false);
    hook.rerender({ input: identity() });
    act(() => { pending.setTitle("Late unauthenticated edit"); hook.result.current.setTitle("Ready edit"); });
    expect(hook.result.current.context.isCurrent()).toBe(true);
    expect(hook.result.current.title).toBe("Ready edit");
  });

  it("starts a fresh lifetime after authentication becomes ready again", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity() } });
    const original = hook.result.current;
    act(() => { original.setTitle("Before refresh"); });
    hook.rerender({ input: identity({ loading: true }) });
    const pending = hook.result.current.context;
    hook.rerender({ input: identity() });
    act(() => { original.setTitle("Late refresh response"); });
    expect(original.context.isCurrent()).toBe(false);
    expect(pending.isCurrent()).toBe(false);
    expect(hook.result.current.context).not.toBe(original.context);
    expect(hook.result.current.title).toBe("");
  });

  it("invalidates captured callbacks on unmount without reviving them on a new mount", async () => {
    const hook = renderHook(() => useEditor(identity()));
    const old = hook.result.current;
    const pending = deferred<string>();
    const work = pending.promise.then(old.setTitle);
    hook.unmount();
    expect(old.context.isCurrent()).toBe(false);
    const next = renderHook(() => useEditor(identity()));
    await act(async () => { pending.resolve("Unmounted result"); await work; });
    expect(next.result.current.title).toBe("");
    expect(next.result.current.context).not.toBe(old.context);
    expect(next.result.current.context.isCurrent()).toBe(true);
  });
});

describe("only a completed same-origin new course may adopt its saved route", () => {
  it("preserves current fields and setters for the exact prepared created ID", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity({ courseId: undefined }) } });
    const original = hook.result.current;
    act(() => { original.setTitle("Created course"); original.setLessonIds(["new-lesson"]); });
    original.context.prepareAdoption("created-a");
    hook.rerender({ input: identity({ courseId: "created-a" }) });
    expect(hook.result.current.context).toBe(original.context);
    expect(hook.result.current.context.requestedCourseId).toBe("created-a");
    expect(hook.result.current.context.isCurrent()).toBe(true);
    expect(hook.result.current.title).toBe("Created course");
    expect(hook.result.current.lessonIds).toEqual(["new-lesson"]);
    act(() => { original.setTitle("Same course continued"); });
    expect(hook.result.current.title).toBe("Same course continued");
  });

  it.each(["unprepared", "different prepared id"])("resets new-course fields on an unrelated route: %s", preparation => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity({ courseId: undefined }) } });
    const old = hook.result.current;
    act(() => { old.setTitle("New A"); old.setLessonIds(["new-a"]); });
    if (preparation !== "unprepared") old.context.prepareAdoption("created-a");
    hook.rerender({ input: identity({ courseId: "course-b" }) });
    act(() => { old.setTitle("Late created A"); });
    expect(old.context.isCurrent()).toBe(false);
    expect(hook.result.current.context.requestedCourseId).toBe("course-b");
    expect(hook.result.current.title).toBe("");
    expect(hook.result.current.lessonIds).toEqual([]);
  });

  it("does not carry prepared adoption across actor changes", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity({ courseId: undefined }) } });
    const old = hook.result.current;
    act(() => { old.setTitle("Actor A draft"); });
    old.context.prepareAdoption("created-a");
    hook.rerender({ input: identity({ actorId: "actor-b", courseId: "created-a" }) });
    expect(old.context.isCurrent()).toBe(false);
    expect(hook.result.current.context).not.toBe(old.context);
    expect(hook.result.current.title).toBe("");
  });

  it("cannot prepare adoption from an old new-course callback after another route was opened", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity({ courseId: undefined }) } });
    const old = hook.result.current;
    hook.rerender({ input: identity({ courseId: "course-b" }) });
    old.context.prepareAdoption("created-a");
    hook.rerender({ input: identity({ courseId: "created-a" }) });
    expect(hook.result.current.context).not.toBe(old.context);
    expect(old.context.isCurrent()).toBe(false);
    expect(hook.result.current.title).toBe("");
  });

  it("cannot use an existing or already adopted course to authorize a later unrelated route", () => {
    const hook = renderHook(({ input }) => useEditor(input), { initialProps: { input: identity({ courseId: undefined }) } });
    const first = hook.result.current.context;
    first.prepareAdoption("created-a");
    hook.rerender({ input: identity({ courseId: "created-a" }) });
    act(() => { hook.result.current.setTitle("Created A"); });
    first.prepareAdoption("created-b");
    hook.rerender({ input: identity({ courseId: "created-b" }) });
    expect(first.isCurrent()).toBe(false);
    expect(hook.result.current.context).not.toBe(first);
    expect(hook.result.current.title).toBe("");
  });
});
