import { useLayoutEffect, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: "actor-a", from: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }));
vi.mock("@/hooks/useCourseFileDeliveryMode", () => ({ useCourseFileDeliveryMode: () => ({ view: { state: "held" }, refresh: vi.fn() }) }));
vi.mock("@/hooks/usePlatformHomeworkTaskProof", () => ({ usePlatformHomeworkTaskProof: () => ({ scope: null, proof: null }) }));
import { useCoursePreview } from "../useCoursePreview";

class Query {
  columns = "";
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq() { return this; } in() { return this; } order() { return this; }
  single() { return this.response(); } maybeSingle() { return this.response(); }
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return this.response().then(resolve, reject); }
  response() { return Promise.resolve({ error: null, data: this.table === "courses" ? { id: "course-a", organization_id: "org-a", title: "Курс", is_published: true, allow_materials_download: true }
    : this.table === "lessons" && this.columns === "content" ? { content: "Учебный текст" }
    : this.table === "lessons" ? [{ id: "lesson-a", course_id: "course-a", title: "Лекция", type: "text", order_index: 0 }]
    : this.table === "course_documents" ? [{ id: "target-doc-a", course_id: "course-a", name: "Программа.pdf", type: "program", file_url: null, allow_download: false }]
    : this.table === "lesson_attachments" ? [{ id: "target-att-a", lesson_id: "lesson-a", name: "Материал.pdf", file_type: "pdf", file_size: 10, category: "material", file_url: "urn:sintagma:course-file-binding:target-att-a" }] : [] }); }
}
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>; }
beforeEach(() => { mocks.actor = "actor-a"; mocks.from.mockImplementation(table => new Query(table)); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); });
afterEach(() => { cleanup(); client.clear(); });
async function ready(result: { current: ReturnType<typeof useCoursePreview> }) { await waitFor(() => expect(result.current.course?.id).toBe("course-a")); }

describe("owner preview stable file selection (mocked RLS reads)", () => {
  it("selects a NULL-URL program by its target document ID and separates download purpose", async () => {
    const { result } = renderHook(() => useCoursePreview({ courseIdOverride: "course-a" }), { wrapper }); await ready(result);
    act(() => result.current.openCourseDocument(result.current.courseDocuments[0], "download"));
    expect(result.current.previewFile).toMatchObject({ purpose: "download", allowDownload: false, reference: { courseId: "course-a", organizationId: "org-a", referenceKind: "course_document", referenceId: "target-doc-a", legacyUrl: null } });
    expect(result.current.legacyEmbeddedMediaAllowed).toBe(false);
  });

  it("retains an attachment's target ID without interpreting a binding URN as a URL", async () => {
    const { result } = renderHook(() => useCoursePreview({ courseIdOverride: "course-a" }), { wrapper }); await ready(result);
    act(() => result.current.openLessonAttachment(result.current.lessonAttachments["lesson-a"][0]));
    expect(result.current.previewFile?.reference).toMatchObject({ referenceKind: "lesson_attachment", referenceId: "target-att-a", legacyUrl: "urn:sintagma:course-file-binding:target-att-a" });
    expect(mocks.from.mock.calls.every(([table]) => ["courses", "lessons", "course_documents", "course_modules", "lesson_attachments"].includes(table))).toBe(true);
  });

  it("does not revive an old actor A handler after A→B→A", async () => {
    const { result, rerender } = renderHook(() => useCoursePreview({ courseIdOverride: "course-a" }), { wrapper }); await ready(result);
    const oldOpen = result.current.openCourseDocument; const oldDocument = result.current.courseDocuments[0];
    mocks.actor = "actor-b"; rerender(); await ready(result);
    mocks.actor = "actor-a"; rerender(); await ready(result);
    act(() => oldOpen(oldDocument));
    expect(result.current.previewFile).toBeNull();
    act(() => result.current.openCourseDocument(result.current.courseDocuments[0]));
    expect(result.current.previewFile?.reference.referenceId).toBe("target-doc-a");
  });

  it("masks the old selection and handler after lesson/documents pane A→B→A", async () => {
    const { result } = renderHook(() => useCoursePreview({ courseIdOverride: "course-a" }), { wrapper }); await ready(result);
    const oldOpen = result.current.openLessonAttachment; const oldAttachment = result.current.lessonAttachments["lesson-a"][0];
    act(() => oldOpen(oldAttachment)); expect(result.current.previewFile).not.toBeNull();
    act(() => result.current.goToDocumentsView()); await waitFor(() => expect(result.current.showDocumentsView).toBe(true));
    expect(result.current.previewFile).toBeNull();
    act(() => result.current.goToLesson(0)); await waitFor(() => expect(result.current.showDocumentsView).toBe(false));
    act(() => oldOpen(oldAttachment)); expect(result.current.previewFile).toBeNull();
  });
  it("rejects an A handler during layout on the first returned-A render, before passive effects", async () => {
    type Action = (() => void) | undefined;
    const { result, rerender } = renderHook(({ action }: { action: Action }) => {
      const value = useCoursePreview({ courseIdOverride: "course-a" });
      useLayoutEffect(() => { action?.(); }, [action]);
      return value;
    }, { wrapper, initialProps: { action: undefined as Action } });
    await ready(result);
    const oldOpen = result.current.openCourseDocument; const oldDocument = result.current.courseDocuments[0];
    mocks.actor = "actor-b"; rerender({ action: undefined }); await ready(result);
    mocks.actor = "actor-a"; rerender({ action: () => oldOpen(oldDocument) }); await ready(result);
    expect(result.current.previewFile).toBeNull();
  });

});
