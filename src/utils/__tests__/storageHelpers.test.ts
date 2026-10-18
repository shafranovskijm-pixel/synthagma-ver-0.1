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

    await expect(
      downloadPrivateFile("billing-documents", "org/file.docx", "Журнал занятий.docx"),
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
