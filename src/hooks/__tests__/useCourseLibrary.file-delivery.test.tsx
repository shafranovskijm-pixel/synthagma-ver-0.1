import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseLibraryResource } from "@/api/courseLibrary";
import type { LegacyCourseFileDelivery } from "@/lib/courseExactFileDelivery";

const mocks = vi.hoisted(() => ({ actor: "actor-a" as string | null, fetch: vi.fn(), sign: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.actor ? { id: mocks.actor } : null }) }));
vi.mock("@/api/courseLibrary", () => ({ fetchCourseLibrary: mocks.fetch, createLibrarySignedUrl: mocks.sign }));
import { useCourseLibrary } from "../useCourseLibrary";

const resource: CourseLibraryResource = { assignmentId: "target-ref", libraryDocumentId: "legacy-source", courseId: "course-a",
  moduleId: null, moduleTitle: null, title: "Материал.pdf", category: "legal_acts", description: null, sourceName: null,
  externalUrl: null, storagePath: "library/own/file.pdf", mimeType: "application/pdf", originalFilename: "Материал.pdf",
  fileSize: 10, editionLabel: null, lastCheckedAt: null, usageBasis: "own_material", status: "active", sortOrder: 0,
  allowDownload: true, createdAt: "2026-10-28", updatedAt: "2026-10-28" };
const legacy = (overrides: Partial<LegacyCourseFileDelivery> = {}): LegacyCourseFileDelivery => ({ schema_version: 1,
  actor_id: "actor-a", organization_id: "org-a", course_id: "course-a", reference_kind: "course_document",
  reference_id: "target-ref", access_mode: "learner", purpose: "preview", mode: "legacy", state: "legacy", binding: null, ...overrides });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); mocks.actor = "actor-a"; mocks.fetch.mockResolvedValue({ resources: [resource], modules: [] }); mocks.sign.mockResolvedValue("https://signed.example.test/own.pdf"); });
afterEach(cleanup);

describe("library reference consumer fences (mocked clients; no native Auth)", () => {
  it.each([
    { actor_id: "actor-b" }, { course_id: "course-b" }, { reference_id: "another-ref" }, { reference_kind: "lesson_attachment" as const },
  ])("rejects a context for another actor/course/reference before signing: %j", async mismatch => {
    const { result } = renderHook(() => useCourseLibrary("course-a"));
    await expect(result.current.getOpenUrl(resource, legacy(mismatch), new AbortController().signal)).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("never treats frozen/held data as legacy", async () => {
    const { result } = renderHook(() => useCourseLibrary("course-a"));
    const adversarial = { ...legacy(), mode: "frozen_required", state: "hold" } as unknown as LegacyCourseFileDelivery;
    await expect(result.current.getOpenUrl(resource, adversarial, new AbortController().signal)).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("mints a legacy signed URL only for the exact approved context and rejects an aborted resolver", async () => {
    const { result } = renderHook(() => useCourseLibrary("course-a"));
    const signal = new AbortController(); signal.abort();
    await expect(result.current.getOpenUrl(resource, legacy(), signal.signal)).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
    await expect(result.current.getOpenUrl(resource, legacy(), new AbortController().signal)).resolves.toBe("https://signed.example.test/own.pdf");
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });

  it("masks old resources and does not revive an A handler after A→B→A", async () => {
    const { result, rerender } = renderHook(({ course }) => useCourseLibrary(course), { initialProps: { course: "course-a" } });
    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    const oldHandler = result.current.getOpenUrl;
    rerender({ course: "course-b" });
    expect(result.current.resources).toEqual([]);
    rerender({ course: "course-a" });
    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    await expect(oldHandler(resource, legacy(), new AbortController().signal)).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("discards a signed URL resolved after actor change and after unmount", async () => {
    const signing = deferred<string>(); mocks.sign.mockReturnValue(signing.promise);
    const { result, rerender, unmount } = renderHook(() => useCourseLibrary("course-a"));
    const pending = result.current.getOpenUrl(resource, legacy(), new AbortController().signal);
    const observed = pending.then(() => "unexpected success", () => "held");
    mocks.actor = "actor-b"; rerender(); unmount();
    await act(async () => signing.resolve("https://signed.example.test/old.pdf"));
    expect(await observed).toBe("held");
  });
  it("masks a disabled render immediately and never revives a pre-disable resolver after enabled→disabled→enabled", async () => {
    const { result, rerender } = renderHook(({ enabled }) => useCourseLibrary("course-a", enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    const oldEnabledHandler = result.current.getOpenUrl;
    rerender({ enabled: false });
    expect(result.current.resources).toEqual([]); expect(result.current.modules).toEqual([]);
    expect(result.current.loading).toBe(false); expect(result.current.error).toBeNull();
    const external = { ...resource, externalUrl: "https://source.example.test/known.pdf", storagePath: null };
    await expect(oldEnabledHandler(resource, legacy(), new AbortController().signal)).rejects.toThrow();
    await expect(result.current.getOpenUrl(external, legacy(), new AbortController().signal)).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled();
    rerender({ enabled: true }); await waitFor(() => expect(result.current.resources).toHaveLength(1));
    await expect(oldEnabledHandler(resource, legacy(), new AbortController().signal)).rejects.toThrow();
    await expect(result.current.getOpenUrl(resource, legacy(), new AbortController().signal)).resolves.toBe("https://signed.example.test/own.pdf");
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });

});
