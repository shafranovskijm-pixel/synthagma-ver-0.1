import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { transpileModule, ScriptTarget } from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeLegacyLoginPrefill, sanitizeTrackingUrl, studentCredentialsText } from "../credentialPrivacy";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const bootstrap = html.match(/<script id="sintagma-privacy-bootstrap">([\s\S]*?)<\/script>/)![1];
const counter = html.match(/<!-- Yandex.Metrika counter[\s\S]*?<script[^>]*>([\s\S]*?)<\/script>/)![1];
const cacheBootstrap = html.match(/<!-- Cache\/SW bootstrap[\s\S]*?<script>([\s\S]*?)<\/script>/)![1];
const recovery = html.match(/<!-- SW recovery[\s\S]*?<script>([\s\S]*?)<\/script>/)![1];

function boot(href: string, referrer = "", historyFails = false) {
  const url = new URL(href);
  const appended: unknown[] = [];
  const inserted: unknown[] = [];
  const timers: Array<() => void> = [];
  const page: Record<string, any> = {
    URL, URLSearchParams, location: url,
    setTimeout: (callback: () => void) => timers.push(callback),
    history: { state: { preserved: true }, replaceState: vi.fn((_state, _title, next) => {
      if (historyFails) throw new Error("Synthetic history denied");
      url.href = new URL(next, url.origin).href;
    }) },
    document: {
      referrer, scripts: [], createElement: (tag: string) => ({ tag }),
      head: { appendChild: (element: unknown) => appended.push(element) },
      getElementsByTagName: () => [{ parentNode: { insertBefore: (element: unknown) => inserted.push(element) } }],
    },
  };
  page.window = page;
  runInNewContext(bootstrap, page);
  runInNewContext(counter, page);
  return { page, url, appended, inserted, timers };
}

describe("credential privacy before analytics", () => {
  beforeEach(() => { delete (window as any).__consumeLegacyLoginPrefill; });
  it("runs before external resources and the counter, leaving next and UTM intact", () => {
    expect(html.indexOf('id="sintagma-privacy-bootstrap"')).toBeLessThan(html.indexOf('<link'));
    const { page, url, inserted } = boot("https://example.test/login?u=synthetic-user&p=synthetic-secret&next=%2Fstudent&utm_source=ya#section");
    expect(url.href).toBe("https://example.test/login?next=%2Fstudent&utm_source=ya#section");
    expect(page.__sintagmaTrackingUrl).toBe(url.href);
    expect(inserted).toEqual([]);
    expect(page.ym).toBeUndefined();
    expect(page.__consumeLegacyLoginPrefill()).toEqual({ login: "synthetic-user", password: "synthetic-secret" });
    expect(page.__consumeLegacyLoginPrefill).toBeUndefined();
  });
  it("expires unused credentials without storing them", () => {
    const { page, timers } = boot("https://example.test/login?u=synthetic-user&p=synthetic-secret");
    timers[0]();
    expect(page.__consumeLegacyLoginPrefill).toBeUndefined();
    expect(bootstrap).not.toMatch(/localStorage|sessionStorage/);
  });
  it("does not purge, reload or mark cache versions on a legacy credential entry, including after consume", () => {
    const { page, timers } = boot("https://example.test/login?u=synthetic-user&p=synthetic-secret&next=%2Fstudent");
    const stored = new Map([["app-version", "previous-build"], ["__asset_id", "previous-assets"]]);
    const storage = { getItem: vi.fn((key: string) => stored.get(key)), setItem: vi.fn(), removeItem: vi.fn() };
    page.localStorage = storage; page.sessionStorage = storage;
    runInNewContext(cacheBootstrap, page);
    runInNewContext(recovery, page);
    expect(page.__consumeLegacyLoginPrefill()).toEqual({ login: "synthetic-user", password: "synthetic-secret" });
    runInNewContext(cacheBootstrap, page);
    runInNewContext(recovery, page);
    expect(page.__sintagmaLegacyLoginEntry).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1); // only the memory expiry, no recovery timer
    const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const refreshStart = main.indexOf("(async () => {");
    const refreshEnd = main.indexOf("})();", refreshStart);
    const refresh = main.slice(refreshStart, refreshEnd + 5);
    expect(refresh).toContain("__sintagmaLegacyLoginEntry) return;");
    const productionRefresh = refresh.split("import.meta.env.PROD").join("true");
    const executable = transpileModule(productionRefresh, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText
      .replace(/\nexport \{\};?\s*$/, ""); // empty module marker is unnecessary in the VM harness
    runInNewContext(executable, page);
    expect(storage.getItem).not.toHaveBeenCalled();
  });
  it("uses a fresh document when moving from private login to organization registration", () => {
    const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
    expect(login).toMatch(/<a href=\{organizationRegistrationTarget\(searchParams\)[\s\S]*?Зарегистрировать организацию[\s\S]*?<\/a>/);
  });
  it("does not load third-party tracking when URL cleanup is refused", () => {
    const { page, inserted } = boot("https://example.test/login?u=synthetic-user&p=synthetic-secret", "", true);
    expect(inserted).toEqual([]);
    expect(page.__sintagmaPrivateEntry).toBe(true);
    expect(page.__sintagmaTrackingUrl).toBe("https://example.test/login");
  });
  it("preserves existing auth tokens without exposing them to analytics", () => {
    const { page, url, inserted } = boot("https://example.test/auto-login?token=synthetic-token");
    expect(url.searchParams.get("token")).toBe("synthetic-token");
    expect(page.__sintagmaTrackingUrl).toBe("https://example.test/auto-login");
    expect(inserted).toEqual([]);
  });
  it("suppresses third-party scripts for a sensitive referrer", () => {
    const { page, inserted } = boot("https://example.test/", "https://example.test/login?u=synthetic-user&p=synthetic-secret");
    expect(page.__sintagmaTrackingReferrer).toBe("https://example.test/login");
    expect(inserted).toEqual([]);
  });
  it("initializes ordinary acquisition tracking with UTM and yclid", () => {
    const { page, inserted } = boot("https://example.test/?utm_source=ya&yclid=click-123", "https://yandex.ru/");
    expect(inserted).toHaveLength(1);
    expect(page.ym.a).toHaveLength(1);
    expect(page.ym.a[0][2]).toMatchObject({ url: "https://example.test/?utm_source=ya&yclid=click-123", referrer: "https://yandex.ru/" });
  });
  it("consumes the prefill helper once", () => {
    const consume = vi.fn(() => { delete (window as any).__consumeLegacyLoginPrefill; return { login: "test", password: "synthetic" }; });
    (window as any).__consumeLegacyLoginPrefill = consume;
    expect(consumeLegacyLoginPrefill()).toEqual({ login: "test", password: "synthetic" });
    expect(consumeLegacyLoginPrefill()).toBeNull();
    expect(consume).toHaveBeenCalledTimes(1);
  });
  it("copies data separately from a credential-free login link", () => {
    const text = studentCredentialsText("https://example.test/", "synthetic-user", "synthetic-secret");
    expect(text.split("\n")[0]).toBe("Вход: https://example.test/login");
    expect(text).toContain("Логин: synthetic-user\nПароль: synthetic-secret");
    expect(text).not.toMatch(/\?u=|&p=/);
  });
  it("sanitizes URL credentials and token fragments for attribution", () => {
    expect(sanitizeTrackingUrl("https://user:password@example.test/login?u=synthetic&p=secret&next=%2Fstudent#access_token=secret&section=help"))
      .toBe("https://example.test/login?next=%2Fstudent#section=help");
  });
  it("sanitizes both new and browser-buffered telemetry page URLs", () => {
    const reporter = readFileSync(resolve(process.cwd(), "src/utils/errorReporter.ts"), "utf8");
    expect(reporter).toContain('page_url: sanitizeTrackingUrl(window.location.href).slice(0, 1024)');
    expect(reporter).toContain('page_url: sanitizeTrackingUrl(typeof event?.page_url === "string" ? event.page_url : "")');
    expect(reporter).not.toContain('page_url: window.location.href');
  });
});
