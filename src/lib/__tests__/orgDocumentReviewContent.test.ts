import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOrgDocumentReviewContent } from "../orgDocumentReviewContent";
const mocks = vi.hoisted(() => ({ sign: vi.fn(), convert: vi.fn() }));
vi.mock("@/utils/storageHelpers", () => ({ extractStoragePath: (s: string) => s, getSignedStorageUrl: mocks.sign }));
vi.mock("mammoth/mammoth.browser", () => ({ convertToHtml: mocks.convert }));
beforeEach(() => { mocks.sign.mockReset(); mocks.sign.mockResolvedValue("https://example.invalid/private"); mocks.convert.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
describe("org file review content is read-only", () => {
  it("loads through private access and sanitizes HTML before the review UI receives it", async () => {
    const request = vi.fn().mockResolvedValue(new Response('<p onclick="bad()">Текст</p><script>bad()</script><img src="https://evil.test">'));
    vi.stubGlobal("fetch", request);
    const abort = new AbortController();
    expect(await loadOrgDocumentReviewContent("org/v1.html", "Положение.html", abort.signal)).toBe("<p>Текст</p>");
    expect(mocks.sign).toHaveBeenCalledWith("org-documents", "org/v1.html", 60);
    expect(request).toHaveBeenCalledWith("https://example.invalid/private", { signal: abort.signal, cache: "no-store", credentials: "omit" });
  });
  it("uses general comments for PDF instead of fabricating an editable HTML document", async () => {
    expect(await loadOrgDocumentReviewContent("org/v1.pdf", "Положение.pdf", new AbortController().signal)).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("converts DOCX without caching into signature revisions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 3, 4, 5]))));
    mocks.convert.mockResolvedValue({ value: '<p>Текст DOCX</p><iframe src="https://evil.test"></iframe>' });
    expect(await loadOrgDocumentReviewContent("org/v1.docx", "Положение.docx", new AbortController().signal)).toBe("<p>Текст DOCX</p>");
    expect(mocks.convert).toHaveBeenCalledOnce();
  });
  it.each([[403, "Denied"], [200, ""]])("rejects unavailable or empty HTML (%s)", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    await expect(loadOrgDocumentReviewContent("org/v1.html", "Положение.html", new AbortController().signal)).rejects.toThrow();
  });
  it("rejects gateway HTML returned instead of a DOCX archive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Gateway</html>")));
    await expect(loadOrgDocumentReviewContent("org/v1.docx", "Положение.docx", new AbortController().signal)).rejects.toThrow(/DOCX/);
    expect(mocks.convert).not.toHaveBeenCalled();
  });
  it("does not read the previous file after the review was closed during signing", async () => {
    const abort = new AbortController(); mocks.sign.mockImplementation(async () => { abort.abort(); return "https://example.invalid/private"; });
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(loadOrgDocumentReviewContent("org/v1.html", "Положение.html", abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});
