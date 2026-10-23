import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { loadOrgDocumentReviewContent } from "../orgDocumentReviewContent";
const mocks = vi.hoisted(() => ({ sign: vi.fn(), convert: vi.fn() }));
vi.mock("@/utils/storageHelpers", () => ({ extractStoragePath: (s: string) => s, getSignedStorageUrl: mocks.sign }));
vi.mock("mammoth/mammoth.browser", () => ({ convertToHtml: mocks.convert }));
beforeEach(() => { vi.stubGlobal("Blob", NodeBlob); mocks.sign.mockReset(); mocks.sign.mockResolvedValue("https://example.invalid/private"); mocks.convert.mockReset(); });
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

  it("uses the supplied original-actor signer for HTML without falling back to global SDK signing", async () => {
    const signUrl=vi.fn().mockResolvedValue("https://example.invalid/original-A"),assertCurrent=vi.fn(),abort=new AbortController();
    const request=vi.fn().mockResolvedValue(new Response('<p onclick="bad()">Scoped text</p><script>bad()</script>'));vi.stubGlobal("fetch",request);
    expect(await loadOrgDocumentReviewContent("org/template.html","Template.html",abort.signal,{signUrl,assertCurrent})).toBe("<p>Scoped text</p>");
    expect(signUrl).toHaveBeenCalledWith({bucket:"org-documents",path:"org/template.html",expiresIn:60,downloadName:"Template.html",signal:abort.signal,deadline:expect.any(Number)});
    expect(mocks.sign).not.toHaveBeenCalled();expect(request).toHaveBeenCalledWith("https://example.invalid/original-A",{signal:abort.signal,cache:"no-store",credentials:"omit"});expect(assertCurrent.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it("refuses a late scoped signed URL after the captured owner epoch changes", async () => {
    let live=true,release!:(value:string)=>void;const signUrl=vi.fn(()=>new Promise<string>(done=>{release=done;})),request=vi.fn();vi.stubGlobal("fetch",request);
    const pending=loadOrgDocumentReviewContent("org/template.html","Template.html",new AbortController().signal,{signUrl,assertCurrent:()=>{if(!live)throw Error("Old owner epoch");}}),rejected=expect(pending).rejects.toThrow("Old owner epoch");
    await vi.waitFor(()=>expect(signUrl).toHaveBeenCalledOnce());live=false;release("https://example.invalid/old");await rejected;expect(request).not.toHaveBeenCalled();expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("does not parse a deferred HTML body after current access was withdrawn", async () => {
    let live=true,release!:(value:Blob)=>void;const body=vi.fn(()=>new Promise<Blob>(done=>{release=done;}));vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,blob:body}));
    const pending=loadOrgDocumentReviewContent("org/template.html","Template.html",new AbortController().signal,{signUrl:vi.fn().mockResolvedValue("https://example.invalid/scoped"),assertCurrent:()=>{if(!live)throw Error("No current access");}}),rejected=expect(pending).rejects.toThrow("No current access");
    await vi.waitFor(()=>expect(body).toHaveBeenCalledOnce());live=false;const text=vi.fn().mockResolvedValue("<p>Private old owner</p>");release({size:20,text} as unknown as Blob);await rejected;expect(text).not.toHaveBeenCalled();expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("refuses a late DOCX text conversion without changing or caching the original", async () => {
    let live=true,release!:(value:{value:string})=>void;vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(new Uint8Array([0x50,0x4b,3,4,5]))));mocks.convert.mockReturnValueOnce(new Promise(done=>{release=done;}));
    const pending=loadOrgDocumentReviewContent("org/template.docx","Template.docx",new AbortController().signal,{signUrl:vi.fn().mockResolvedValue("https://example.invalid/scoped"),assertCurrent:()=>{if(!live)throw Error("Old document epoch");}}),rejected=expect(pending).rejects.toThrow("Old document epoch");
    await vi.waitFor(()=>expect(mocks.convert).toHaveBeenCalledOnce());live=false;release({value:"<p>Private old version</p>"});await rejected;expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("keeps PDF as unavailable inline content even when a scoped signer is provided",async()=>{
    const signUrl=vi.fn();expect(await loadOrgDocumentReviewContent("org/template.pdf","Template.pdf",new AbortController().signal,{signUrl,assertCurrent:vi.fn()})).toBeNull();expect(signUrl).not.toHaveBeenCalled();expect(mocks.sign).not.toHaveBeenCalled();
  });

});
