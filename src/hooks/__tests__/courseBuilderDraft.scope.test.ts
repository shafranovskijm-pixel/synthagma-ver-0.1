import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@/components/course-builder/LessonTypeConfig";

// The actual draft functions use browser storage only. Unrelated import/media
// dependencies are inert so no backend, upload or paid generation can run here.
vi.mock("@/components/course-builder/block-editor", () => ({
  htmlToBlocks: vi.fn(), blocksToJson: vi.fn(), jsonToBlocks: vi.fn(), markdownToBlocks: vi.fn(),
}));
vi.mock("@/utils/htmlCourseParser", () => ({ isHtmlContent: vi.fn(), parseHtmlCourse: vi.fn() }));
vi.mock("@/utils/structuredCourseImport", () => ({ isCszStructuredCourseHtml: vi.fn() }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn(), safeFetch: vi.fn() }));
vi.mock("@/utils/courseBuilderHelpers", () => ({ uploadToStorage: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import {
  clearScopedBuilderDraft, hasLegacyBuilderDraft, readScopedBuilderDraft, saveScopedBuilderDraft,
  type BuilderDraftIdentity, type ScopedBuilderDraft,
} from "../useCourseBuilderHelpers";

const identity = (changes: Partial<BuilderDraftIdentity> = {}): BuilderDraftIdentity => ({
  actorId: "actor-a", organizationId: "org-a", requestedCourseId: "course-a", ...changes,
});
const lesson = (): Lesson => ({ id: "lesson-a", title: "Synthetic lesson", type: "text", content: "Private A text", expanded: false });
const data = (changes: Partial<Pick<ScopedBuilderDraft, "courseId" | "title" | "description" | "lessons">> = {}) => ({
  courseId: "course-a", title: "A draft", description: "Synthetic description", lessons: [lesson()], ...changes,
});
function stored(changes: Partial<ScopedBuilderDraft> = {}): ScopedBuilderDraft {
  return { version: 2, actorId: "actor-a", organizationId: "org-a", requestedCourseId: "course-a", ...data(), savedAt: 1234, ...changes };
}
function putRaw(input: BuilderDraftIdentity, raw: string) {
  const key = readScopedBuilderDraft(input).receipt.key;
  localStorage.setItem(key, raw);
  return key;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("attributed builder drafts use the actual browser storage API", () => {
  it("round-trips a confirmed actor, organization and requested course with an exact source receipt", () => {
    const input = identity();
    const empty = readScopedBuilderDraft(input);
    expect(empty.draft).toBeNull();
    expect(empty.receipt.raw).toBeNull();
    const receipt = saveScopedBuilderDraft(input, data(), empty.receipt);
    const result = readScopedBuilderDraft(input);
    expect(result.receipt).toEqual(receipt);
    expect(localStorage.getItem(receipt.key)).toBe(receipt.raw);
    expect(result.draft).toMatchObject({ version: 2, ...input, ...data() });
    expect(Number.isFinite(result.draft?.savedAt)).toBe(true);
  });

  it.each([
    ["another actor", { actorId: "actor-b" }],
    ["another organization", { organizationId: "org-b" }],
    ["another course", { requestedCourseId: "course-b" }],
    ["a new-course route", { requestedCourseId: undefined }],
  ] satisfies Array<[string, Partial<BuilderDraftIdentity>]>) ("does not expose or overwrite A's draft from %s", (_label, changes) => {
    const a = identity(), b = identity(changes);
    const aReceipt = saveScopedBuilderDraft(a, data(), readScopedBuilderDraft(a).receipt);
    const bBefore = readScopedBuilderDraft(b);
    expect(bBefore.draft).toBeNull();
    expect(bBefore.receipt.key).not.toBe(aReceipt.key);
    const bData = data({ courseId: b.requestedCourseId ?? null, title: "B draft", lessons: [] });
    const bReceipt = saveScopedBuilderDraft(b, bData, bBefore.receipt);
    expect(readScopedBuilderDraft(b).draft?.title).toBe("B draft");
    expect(readScopedBuilderDraft(a).draft?.title).toBe("A draft");
    expect(localStorage.getItem(aReceipt.key)).toBe(aReceipt.raw);
    expect(bReceipt.key).not.toBe(aReceipt.key);
  });

  it("does not alias identities containing separators or encoded characters", () => {
    const a = identity({ actorId: "a:b", organizationId: "c/%", requestedCourseId: "course/a" });
    const b = identity({ actorId: "a", organizationId: "b:c/%", requestedCourseId: "course/a" });
    const first = saveScopedBuilderDraft(a, data({ courseId: a.requestedCourseId! }), readScopedBuilderDraft(a).receipt);
    const second = saveScopedBuilderDraft(b, data({ courseId: b.requestedCourseId!, title: "B" }), readScopedBuilderDraft(b).receipt);
    expect(first.key).not.toBe(second.key);
    expect(readScopedBuilderDraft(a).draft?.title).toBe("A draft");
    expect(readScopedBuilderDraft(b).draft?.title).toBe("B");
  });

  it("retains exact valid source bytes, including formatting, until an explicit save", () => {
    const raw = JSON.stringify(stored(), null, 2);
    const key = putRaw(identity(), raw);
    const result = readScopedBuilderDraft(identity());
    expect(result.draft?.title).toBe("A draft");
    expect(result.receipt).toEqual({ key, raw });
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it("keeps new-route recovery distinct from a subsequently created course route", () => {
    const fresh = identity({ requestedCourseId: undefined });
    const receipt = saveScopedBuilderDraft(fresh, data({ courseId: "created-a" }), readScopedBuilderDraft(fresh).receipt);
    expect(readScopedBuilderDraft(fresh).draft).toMatchObject({ requestedCourseId: null, courseId: "created-a" });
    const adopted = readScopedBuilderDraft(identity({ requestedCourseId: "created-a" }));
    expect(adopted.draft).toBeNull();
    expect(adopted.receipt.key).not.toBe(receipt.key);
    expect(localStorage.getItem(receipt.key)).toBe(receipt.raw);
  });

  it("allows a same-scope empty-content lesson without confusing it with missing storage", () => {
    const blank = { ...lesson(), content: "", blocks: [], __contentLoaded: true };
    saveScopedBuilderDraft(identity(), data({ lessons: [blank] }), readScopedBuilderDraft(identity()).receipt);
    expect(readScopedBuilderDraft(identity()).draft?.lessons).toEqual([blank]);
  });
});

describe("unverified draft payloads are never silently repaired or overwritten", () => {
  it.each(["{unclosed", "undefined", "", "null", "[]"])("retains invalid source bytes %j", raw => {
    const key = putRaw(identity(), raw);
    expect(() => readScopedBuilderDraft(identity())).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(() => saveScopedBuilderDraft(identity(), data(), { key, raw })).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it.each([
    ["version", { version: 1 }],
    ["actor", { actorId: "actor-b" }],
    ["organization", { organizationId: "org-b" }],
    ["requested course", { requestedCourseId: "course-b" }],
    ["actual course", { courseId: "course-b" }],
    ["missing actual course", { courseId: null }],
    ["title", { title: null }],
    ["description", { description: {} }],
    ["timestamp", { savedAt: null }],
    ["lesson collection", { lessons: {} }],
    ["lesson identity", { lessons: [{ ...lesson(), id: null }] }],
    ["lesson content", { lessons: [{ ...lesson(), content: null }] }],
    ["lesson blocks", { lessons: [{ ...lesson(), blocks: null }] }],
  ] as Array<[string, Record<string, unknown>]>) ("rejects an unverified %s while retaining every byte", (_label, changes) => {
    const raw = JSON.stringify({ ...stored(), ...changes });
    const key = putRaw(identity(), raw);
    expect(() => readScopedBuilderDraft(identity())).toThrow();
    expect(() => saveScopedBuilderDraft(identity(), data(), { key, raw })).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it("rejects an invalid new payload without destroying the last valid draft", () => {
    const first = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    expect(() => saveScopedBuilderDraft(identity(), data({ courseId: "wrong-course" }), first)).toThrow();
    expect(localStorage.getItem(first.key)).toBe(first.raw);
    expect(readScopedBuilderDraft(identity()).draft?.title).toBe("A draft");
  });

  it("propagates denied storage reads without fabricating an empty receipt", () => {
    const first = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => { throw new DOMException("denied", "SecurityError"); });
    expect(() => readScopedBuilderDraft(identity())).toThrow();
    getItem.mockRestore();
    expect(localStorage.getItem(first.key)).toBe(first.raw);
  });

  it("propagates failed storage writes and retains the prior valid source", () => {
    const first = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(() => saveScopedBuilderDraft(identity(), data({ title: "Unsaved edit" }), first)).toThrow();
    setItem.mockRestore();
    expect(localStorage.getItem(first.key)).toBe(first.raw);
  });
});

describe("captured draft receipts prevent clearing or replacing a changed source", () => {
  it("refuses an old empty receipt after another draft has appeared", () => {
    const empty = readScopedBuilderDraft(identity()).receipt;
    const created = saveScopedBuilderDraft(identity(), data(), empty);
    expect(() => saveScopedBuilderDraft(identity(), data({ title: "Stale overwrite" }), empty)).toThrow();
    expect(clearScopedBuilderDraft(empty)).toBe(false);
    expect(localStorage.getItem(created.key)).toBe(created.raw);
  });

  it("refuses a receipt from another actor even when that actor's storage is empty", () => {
    const foreign = readScopedBuilderDraft(identity({ actorId: "actor-b" })).receipt;
    expect(() => saveScopedBuilderDraft(identity(), data(), foreign)).toThrow();
    expect(readScopedBuilderDraft(identity()).draft).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("does not clear or overwrite a later edit when server completion holds the older receipt", () => {
    const captured = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    const later = saveScopedBuilderDraft(identity(), data({ title: "Edited while server save was pending" }), captured);
    expect(clearScopedBuilderDraft(captured)).toBe(false);
    expect(() => saveScopedBuilderDraft(identity(), data({ title: "Late stale save" }), captured)).toThrow();
    expect(localStorage.getItem(later.key)).toBe(later.raw);
    expect(readScopedBuilderDraft(identity()).draft?.title).toBe("Edited while server save was pending");
  });

  it("requires exact source bytes even when replacement JSON has equivalent fields", () => {
    const captured = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    const differentRaw = JSON.stringify(JSON.parse(captured.raw!), null, 2);
    localStorage.setItem(captured.key, differentRaw);
    expect(clearScopedBuilderDraft(captured)).toBe(false);
    expect(() => saveScopedBuilderDraft(identity(), data({ title: "Stale" }), captured)).toThrow();
    expect(localStorage.getItem(captured.key)).toBe(differentRaw);
  });

  it("does not recreate a removed source from a stale save receipt", () => {
    const captured = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    localStorage.removeItem(captured.key);
    expect(() => saveScopedBuilderDraft(identity(), data(), captured)).toThrow();
    expect(clearScopedBuilderDraft(captured)).toBe(false);
    expect(localStorage.getItem(captured.key)).toBeNull();
  });

  it("clears exactly the unchanged captured source and preserves another scope", () => {
    const a = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    const bIdentity = identity({ organizationId: "org-b" });
    const b = saveScopedBuilderDraft(bIdentity, data({ title: "Other scope" }), readScopedBuilderDraft(bIdentity).receipt);
    expect(clearScopedBuilderDraft(a)).toBe(true);
    expect(localStorage.getItem(a.key)).toBeNull();
    expect(localStorage.getItem(b.key)).toBe(b.raw);
  });
});

describe("unattributed legacy drafts remain present without automatic recovery or mutation", () => {
  it.each([undefined, "course-a"])("only checks presence of the legacy key for %s, without parsing its contents", requestedCourseId => {
    const legacyKey = `course_draft_${requestedCourseId || "new"}`;
    const legacyRaw = "{malformed private unattributed legacy bytes";
    localStorage.setItem(legacyKey, legacyRaw);
    const parse = vi.spyOn(JSON, "parse");
    expect(hasLegacyBuilderDraft(requestedCourseId)).toBe(true);
    expect(readScopedBuilderDraft(identity({ requestedCourseId })).draft).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    expect(localStorage.getItem(legacyKey)).toBe(legacyRaw);
  });

  it("leaves valid and malformed legacy bytes untouched through scoped save, read and clear", () => {
    const newRaw = "{unattributed legacy";
    const courseRaw = JSON.stringify({ title: "Unattributed course", lessons: [lesson()] });
    localStorage.setItem("course_draft_new", newRaw);
    localStorage.setItem("course_draft_course-a", courseRaw);
    const receipt = saveScopedBuilderDraft(identity(), data(), readScopedBuilderDraft(identity()).receipt);
    expect(readScopedBuilderDraft(identity()).draft?.title).toBe("A draft");
    expect(clearScopedBuilderDraft(receipt)).toBe(true);
    expect(localStorage.getItem("course_draft_new")).toBe(newRaw);
    expect(localStorage.getItem("course_draft_course-a")).toBe(courseRaw);
    expect(hasLegacyBuilderDraft(undefined)).toBe(true);
    expect(hasLegacyBuilderDraft("course-a")).toBe(true);
  });

  it("refuses a legacy-key clear receipt and distinguishes absence from an empty legacy value", () => {
    expect(hasLegacyBuilderDraft(undefined)).toBe(false);
    localStorage.setItem("course_draft_new", "");
    expect(hasLegacyBuilderDraft(undefined)).toBe(true);
    expect(clearScopedBuilderDraft({ key: "course_draft_new", raw: "" })).toBe(false);
    expect(localStorage.getItem("course_draft_new")).toBe("");
  });
});
