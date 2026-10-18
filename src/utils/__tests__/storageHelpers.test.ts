import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadPrivateFile, openPrivateFile, extractStoragePath } from "@/utils/storageHelpers";

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })),
    },
  },
}));

vi.mock("@/utils/proxyFetch", () => ({
  proxiedAssetUrl: (url: string) => url,
}));

describe("private storage file actions", () => {
  it("resolves legacy public and signed locators with encoded names without retaining credentials", () => {
    const path = "org/Лицензия центра.pdf";
    expect(extractStoragePath(`https://storage.example/storage/v1/object/public/org-documents/${encodeURI(path)}`, "org-documents")).toBe(path);
    expect(extractStoragePath(`https://storage.example/storage/v1/object/sign/org-documents/${encodeURI(path)}?token=secret#page=2`, "org-documents")).toBe(path);
    expect(extractStoragePath("org/literal%20name.pdf", "org-documents")).toBe("org/literal%20name.pdf");
  });
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.createSignedUrl.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens a blank tab synchronously and navigates it after signing", async () => {
    const target = {
      opener: window,
      close: vi.fn(),
      location: { replace: vi.fn() },
    } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(target);
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed.docx" },
      error: null,
    });

    await expect(openPrivateFile("billing-documents", "org/file.docx")).resolves.toBe(true);

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(target.opener).toBeNull();
    expect(target.location.replace).toHaveBeenCalledWith("https://storage.example/signed.docx");
  });

  it("reports popup blocking and signing failures as false", async () => {
    vi.spyOn(window, "open").mockReturnValueOnce(null);
    await expect(openPrivateFile("billing-documents", "org/file.docx")).resolves.toBe(false);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();

    const target = {
      opener: window,
      close: vi.fn(),
      location: { replace: vi.fn() },
    } as unknown as Window;
    vi.mocked(window.open).mockReturnValueOnce(target);
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "signing failed" } });

    await expect(openPrivateFile("billing-documents", "org/file.docx")).resolves.toBe(false);
    expect(target.close).toHaveBeenCalledTimes(1);
  });

  it("retrieves private bytes and downloads a local blob with the requested name", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchFile = vi.fn().mockResolvedValue(new Response(new Blob(["Synthetic document bytes"]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }));
    vi.stubGlobal("fetch", fetchFile);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:synthetic-private-document"); static revokeObjectURL = vi.fn(); });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-download.docx" },
      error: null,
    });

    const progress = vi.fn((phase: string) => { if (phase === "handed_to_browser") expect(click).toHaveBeenCalledOnce(); });
    await expect(
      downloadPrivateFile("billing-documents", "org/file.docx", "Журнал занятий.docx", { onProgress: progress }),
    ).resolves.toBe(true);

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "org/file.docx",
      3600,
      { download: "Журнал занятий.docx" },
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetchFile).toHaveBeenCalledWith("https://storage.example/signed-download.docx", expect.objectContaining({ cache: "no-store", credentials: "omit", signal: expect.any(AbortSignal) }));
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe("blob:synthetic-private-document");
    expect(anchor.download).toBe("Журнал занятий.docx");
    expect(document.querySelector('a[download="Журнал занятий.docx"]')).not.toBeInTheDocument();
    expect(progress.mock.calls.map(([phase]) => phase)).toEqual(["preparing", "downloading", "handed_to_browser"]);
  });

  it("bounds signing by the total deadline and ignores a late signed URL", async () => {
    let finishSigning!: (value: unknown) => void;
    mocks.createSignedUrl.mockReturnValue(new Promise(resolve => { finishSigning = resolve; }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const fetchFile = vi.fn(); vi.stubGlobal("fetch", fetchFile);
    const progress = vi.fn();
    const pending = downloadPrivateFile("org-documents", "org/qa.pdf", "QA.pdf", { onProgress: progress });
    await vi.advanceTimersByTimeAsync(45000);
    await expect(pending).resolves.toBe(false);
    expect(progress.mock.calls.map(([phase]) => phase)).toEqual(["preparing", "timed_out"]);
    finishSigning({ data: { signedUrl: "https://storage.example/qa.pdf" }, error: null });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFile).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith("timed_out");
  });

  it("shares one deadline between signing and fetch, aborting even if a late transport ignores the signal", async () => {
    let finishSigning!: (value: unknown) => void, finishFetch!: (value: unknown) => void;
    mocks.createSignedUrl.mockReturnValue(new Promise(resolve => { finishSigning = resolve; }));
    const fetchFile = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise(resolve => { finishFetch = resolve; })); vi.stubGlobal("fetch", fetchFile);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const progress = vi.fn();
    const pending = downloadPrivateFile("org-documents", "org/qa.pdf", "QA.pdf", { onProgress: progress });
    await vi.advanceTimersByTimeAsync(40000);
    finishSigning({ data: { signedUrl: "https://storage.example/qa.pdf" }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(progress).toHaveBeenLastCalledWith("downloading");
    const signal = fetchFile.mock.calls[0][1]?.signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe(false); expect(signal.aborted).toBe(true);
    const readBody = vi.fn().mockResolvedValue(new Blob(["PDF"]));
    finishFetch({ ok: true, headers: new Headers({ "content-type": "application/pdf" }), blob: readBody });
    await vi.advanceTimersByTimeAsync(1);
    expect(readBody).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith("timed_out");
  });

  it.each(["deadline", "cancel"])("does not download a body arriving after %s", async reason => {
    let finishBody!: (blob: Blob) => void;
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/qa.pdf" }, error: null });
    const body = vi.fn(() => new Promise<Blob>(resolve => { finishBody = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/pdf" }), blob: body }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const progress = vi.fn(), controller = new AbortController();
    const pending = downloadPrivateFile("org-documents", "org/qa.pdf", "QA.pdf", { onProgress: progress, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0); expect(body).toHaveBeenCalledOnce();
    if (reason === "deadline") await vi.advanceTimersByTimeAsync(45000); else controller.abort();
    await expect(pending).resolves.toBe(false);
    finishBody(new Blob(["PDF"])); await vi.advanceTimersByTimeAsync(1);
    expect(click).not.toHaveBeenCalled(); expect(progress).toHaveBeenLastCalledWith(reason === "deadline" ? "timed_out" : "cancelled");
  });

  it.each([
    [403, "application/pdf", "Access denied"],
    [200, "text/html", "<html>Proxy gateway error</html>"],
    [200, "application/json", '{"error":"not a document"}'],
    [200, "application/pdf", ""],
  ])("does not start a download for an unavailable or invalid response (%s, %s)", async (status, mime, body) => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers: { "Content-Type": mime } })));
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/private.pdf" }, error: null });
    await expect(downloadPrivateFile("org-documents", "org/private.pdf")).resolves.toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("reports a transport failure without navigating to an unverified download", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Synthetic network failure")));
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/private.pdf" }, error: null });
    await expect(downloadPrivateFile("org-documents", "org/private.pdf")).resolves.toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});
