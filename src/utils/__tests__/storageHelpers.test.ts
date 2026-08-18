import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadPrivateFile, openPrivateFile } from "@/utils/storageHelpers";

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
  beforeEach(() => {
    mocks.createSignedUrl.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("downloads with storage disposition and a temporary anchor", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
    expect(document.querySelector('a[download="Журнал занятий.docx"]')).not.toBeInTheDocument();
  });
});
