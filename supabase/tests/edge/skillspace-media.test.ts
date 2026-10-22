// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaTransfer } from "../../functions/_shared/skillspace-media";

afterEach(() => { vi.unstubAllGlobals(); });
const bytes = () => new Response("synthetic-image", { status: 200, headers: { "Content-Type": "image/png" } });
function fixture(request: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", request);
  const upload = vi.fn(async () => ({ error: null }));
  const log = vi.fn();
  const transfer = createMediaTransfer({ storage: { from: () => ({ upload }) } }, "https://storage.example.invalid", "fixture-org",
    new Map([["Auth-Token", "synthetic-session"]]), log, "https://school.skillspace.ru");
  return { ...transfer, upload, log };
}
describe("SkillSpace media credential boundary", () => {
  it("keeps cookies on the validated school origin only", async () => {
    const request = vi.fn(async () => bytes()); const f = fixture(request);
    expect(await f.downloadAndReupload("https://school.skillspace.ru/media/figure.png")).toContain("/course-files/fixture-org/");
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { Cookie: "Auth-Token=synthetic-session" } });
    expect(f.upload).toHaveBeenCalledTimes(1);
  });
  it.each(["https://cdn.example.test/image.png", "https://other.skillspace.ru/image.png", "https://evil.test/image.png?host=skillspace.ru"])("downloads public external media without the school cookie: %s", async url => {
    const request = vi.fn(async () => bytes()); const f = fixture(request);
    expect(await f.downloadAndReupload(url)).not.toBeNull();
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: {} });
    expect(new Headers(request.mock.calls[0][1].headers).has("Cookie")).toBe(false);
  });
  it("strips cookies at a school-to-CDN redirect and validates subsequent hops", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "https://cdn.example.test/image.png" } }))
      .mockResolvedValueOnce(bytes());
    const f = fixture(request); expect(await f.downloadAndReupload("https://school.skillspace.ru/download/1")).not.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1].headers.Cookie).toBe("Auth-Token=synthetic-session");
    expect(request.mock.calls[1][1]).toMatchObject({ redirect: "manual", headers: {} });
  });
  it("keeps cookies through a relative redirect within the school origin", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: "../image.png" } })).mockResolvedValueOnce(bytes());
    expect(await fixture(request).downloadAndReupload("https://school.skillspace.ru/download/1")).not.toBeNull();
    expect(request.mock.calls[1][0]).toBe("https://school.skillspace.ru/image.png");
    expect(request.mock.calls[1][1].headers.Cookie).toBe("Auth-Token=synthetic-session");
  });
  it.each(["https://127.0.0.1/file", "https://2130706433/file", "https://169.254.169.254/file", "https://[::1]/file", "https://[::ffff:127.0.0.1]/file", "https://host.internal/file", "https://localhost/file", "http://cdn.example.test/file", "https://user:password@cdn.example.test/file", "https://cdn.example.test:8443/file"])("rejects unsafe initial and redirected media target: %s", async target => {
    const request = vi.fn(); const f = fixture(request);
    expect(await f.downloadAndReupload(target)).toBeNull(); expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(new Response("", { status: 302, headers: { Location: target } }));
    expect(await f.downloadAndReupload("https://school.skillspace.ru/download/1")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1); expect(f.upload).not.toHaveBeenCalled();
  });
  it("bounds redirect loops to four requests", async () => {
    const request = vi.fn(async () => new Response("", { status: 302, headers: { Location: "/loop" } }));
    const f = fixture(request); expect(await f.downloadAndReupload("https://school.skillspace.ru/loop")).toBeNull();
    expect(request).toHaveBeenCalledTimes(4); expect(f.upload).not.toHaveBeenCalled();
  });
  it("does not write signed media query strings to diagnostic logs", async () => {
    const f = fixture(vi.fn(async () => new Response("", { status: 403 })));
    await f.downloadAndReupload("https://cdn.example.test/image.png?token=synthetic-sensitive-token");
    expect(f.log.mock.calls.flat().join(" ")).not.toContain("synthetic-sensitive-token");
  });
});
