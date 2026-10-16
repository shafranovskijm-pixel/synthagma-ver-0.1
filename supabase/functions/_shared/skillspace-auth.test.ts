// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiFetch } from "./skillspace-auth";

afterEach(() => { vi.unstubAllGlobals(); });
describe("SkillSpace Cookie API requests", () => {
  it("uses manual redirects and never forwards cookies to the Location target", async () => {
    const request = vi.fn(async () => new Response("", { status: 302, headers: { Location: "https://evil.test/collect" } }));
    vi.stubGlobal("fetch", request);
    const api = createApiFetch("https://school.skillspace.ru", new Map([["Auth-Token", "synthetic-session"]]), vi.fn());
    expect(await api("/api/rest/course/123")).toMatchObject({ ok: false, status: 302 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("https://school.skillspace.ru/api/rest/course/123", expect.objectContaining({
      redirect: "manual", headers: expect.objectContaining({ Cookie: "Auth-Token=synthetic-session" }),
    }));
  });
  it.each(["//evil.test/collect", "https://other.skillspace.ru/api", "http://school.skillspace.ru/api", "https://user@school.skillspace.ru/api"])("does not send a cookie to a caller-supplied unsafe API target %s", async path => {
    const request = vi.fn(() => { throw new Error("No network permitted"); }); vi.stubGlobal("fetch", request);
    const api = createApiFetch("https://school.skillspace.ru", new Map([["Auth-Token", "synthetic-session"]]), vi.fn());
    expect(await api(path)).toMatchObject({ ok: false, status: 0 }); expect(request).not.toHaveBeenCalled();
  });
  it("preserves ordinary API response parsing and session-cookie updates", async () => {
    const request = vi.fn(async () => new Response('{"id":123}', { status: 200, headers: { "Set-Cookie": "Auth-Token=synthetic-next; Secure; HttpOnly" } }));
    vi.stubGlobal("fetch", request);
    const cookies = new Map([["Auth-Token", "synthetic-session"]]);
    expect(await createApiFetch("https://school.skillspace.ru", cookies, vi.fn())("/api/rest/course/123")).toMatchObject({ ok: true, data: { id: 123 } });
    expect(cookies.get("Auth-Token")).toBe("synthetic-next");
  });
});
