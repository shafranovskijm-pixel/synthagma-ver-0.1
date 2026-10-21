import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeEvent } from "react";
import { useStorageManager } from "../useStorageManager";
const mocks = vi.hoisted(() => ({ load: vi.fn(), signed: vi.fn(), download: vi.fn(), remove: vi.fn(), upload: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: vi.fn(() => ({ remove: mocks.remove, upload: mocks.upload })) } } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn(async () => ({ data: { configured: false }, error: null })) }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: (url: string) => url }));
vi.mock("@/utils/storageHelpers", () => ({ getSignedStorageUrl: mocks.signed, downloadPrivateFile: mocks.download }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/storage/managedStorageFiles", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/storage/managedStorageFiles")>()), loadManagedStorageEntries: mocks.load }));
const entry = (path = "company-a/contract.pdf", bucket = "company-documents") => ({ bucket, path, size: 42, createdAt: "2026-10-21T00:00:00Z", baseUrl: "https://project.supabase.co" });
const loaded = (entries = [entry()]) => ({ entries, errors: [] });
async function ready() {
  const rendered = renderHook(() => useStorageManager("org-a"));
  await waitFor(() => expect(rendered.result.current.files).toHaveLength(1));
  return rendered;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.load.mockReset().mockResolvedValue(loaded()); mocks.signed.mockReset().mockResolvedValue("https://project.supabase.co/signed");
  mocks.remove.mockReset().mockResolvedValue({ data: [{ name: "company-a/contract.pdf" }], error: null });
  mocks.upload.mockReset().mockResolvedValue({ data: { path: "org-a/standalone.pdf" }, error: null });
  mocks.download.mockReset().mockResolvedValue(true);
});
describe("storage manager authorized access", () => {
  it("does not create public locators for protected files and refuses failed signing", async () => {
    mocks.signed.mockResolvedValue(null);
    const { result } = await ready();
    expect(result.current.files[0]).toMatchObject({ isPrivate: true, url: "" });
    await act(async () => { await result.current.openPreview(result.current.files[0]); });
    expect(mocks.signed).toHaveBeenCalledWith("company-documents", "company-a/contract.pdf");
    expect(result.current.previewUrl).toBeNull(); expect(result.current.previewLoading).toBe(false);
  });
  it("keeps the user gesture popup but closes it on denied private signing without public fallback", async () => {
    mocks.signed.mockResolvedValue(null);
    const target = { opener: {}, close: vi.fn(), location: { replace: vi.fn() } };
    const open = vi.spyOn(window, "open").mockReturnValue(target as unknown as Window);
    const { result } = await ready();
    await act(async () => { await result.current.openInNewTab(result.current.files[0]); });
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(target.close).toHaveBeenCalledOnce(); expect(target.location.replace).not.toHaveBeenCalled(); expect(target.opener).toBeNull();
    open.mockRestore();
  });
  it.each([{ data: null, error: { message: "denied" } }, { data: [], error: null }])("does not claim removal or hide a file when deletion is not confirmed: %j", async response => {
    mocks.remove.mockResolvedValue(response);
    const { result } = await ready();
    act(() => result.current.setDeleteFile(result.current.files[0]));
    await act(async () => { await result.current.handleDelete(); });
    expect(result.current.files).toHaveLength(1); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalled();
  });
  it("removes a row only after Storage confirms the exact scoped object", async () => {
    const { result } = await ready();
    act(() => result.current.setDeleteFile(result.current.files[0]));
    await act(async () => { await result.current.handleDelete(); });
    expect(mocks.remove).toHaveBeenCalledWith(["company-a/contract.pdf"]);
    expect(result.current.files).toHaveLength(0); expect(mocks.success).toHaveBeenCalledWith("Файл удалён");
  });
  it("never overwrites existing course content and standalone upload remains after refresh", async () => {
    const { result } = await ready();
    const input = { files: [new File(["pdf"], "standalone.pdf", { type: "application/pdf" })], value: "selected" };
    await act(async () => { await result.current.handleUpload({ target: input } as unknown as ChangeEvent<HTMLInputElement>); });
    expect(mocks.upload).toHaveBeenCalledWith("org-a/standalone.pdf", input.files[0], { upsert: false });
    expect(result.current.files.some(file => file.name === "standalone.pdf")).toBe(true);
    mocks.load.mockResolvedValue(loaded([entry("org-a/standalone.pdf", "course-files")]));
    await act(async () => { await result.current.loadFiles(); });
    expect(result.current.files).toHaveLength(1); expect(result.current.files[0].name).toBe("standalone.pdf");
  });
  it("does not apply a late old-organization result to the new organization", async () => {
    let finishOld!: (value: ReturnType<typeof loaded>) => void;
    const old = new Promise<ReturnType<typeof loaded>>(resolve => { finishOld = resolve; });
    mocks.load.mockImplementation((_client, org) => org === "org-a" ? old : Promise.resolve(loaded([entry("company-b/current.pdf")])));
    const { result, rerender } = renderHook(({ org }) => useStorageManager(org), { initialProps: { org: "org-a" } });
    rerender({ org: "org-b" });
    await waitFor(() => expect(result.current.files[0]?.name).toBe("current.pdf"));
    await act(async () => { finishOld(loaded([entry("company-a/old.pdf")])); await old; });
    expect(result.current.files.map(file => file.name)).toEqual(["current.pdf"]);
  });
  it("keeps partial-list failures visible instead of returning a completed empty state", async () => {
    mocks.load.mockResolvedValue({ entries: [], errors: ["billing-documents"] });
    const { result } = renderHook(() => useStorageManager("org-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadErrors).toEqual(["billing-documents"]); expect(result.current.files).toEqual([]);
  });
});
