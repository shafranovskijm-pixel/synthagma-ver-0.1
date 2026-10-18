import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), history: vi.fn(), current: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/orgDocumentLifecycle", () => ({ createDocumentUploadOperation: vi.fn(), saveDocumentUpload: vi.fn(), restoreDocumentFile: vi.fn() }));
import { useOrgDocumentVersions } from "../useOrgDocumentVersions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === "org_document_versions"
    ? { order: mocks.history } : { single: mocks.current } }) }));
  mocks.current.mockResolvedValue({ data: { document_revision: 2, current_version_id: "version-2", deleted_at: null }, error: null });
});
describe("version history read resilience", () => {
  it.each(["history", "current"])("keeps a failed %s read distinct from an empty history and permits a successful retry", async failedRead => {
    mocks.history.mockResolvedValue({ data: [{ id: "version-2", version_number: 2 }], error: null });
    mocks[failedRead as "history" | "current"].mockResolvedValueOnce({ data: null, error: { message: "Connection unavailable" } });
    const { result } = renderHook(() => useOrgDocumentVersions("document", true));
    await waitFor(() => expect(result.current.loadError).toContain("Не удалось загрузить историю версий"));
    expect(result.current.hasLoaded).toBe(false); expect(result.current.canChange).toBe(false);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.loadError).toBeNull(); expect(result.current.hasLoaded).toBe(true);
    expect(result.current.versions).toEqual([{ id: "version-2", version_number: 2 }]);
    expect(result.current.currentVersionId).toBe("version-2"); expect(result.current.canChange).toBe(true);
  });
});
