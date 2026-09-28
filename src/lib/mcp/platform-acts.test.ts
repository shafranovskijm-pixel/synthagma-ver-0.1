import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSintagmaInvoiceAct, previewSintagmaInvoiceAct, searchSintagmaBillingOrganizations, sha256 } from "./platform-acts";
import type { InvoiceContext } from "./invoice-source";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
const ORG = "10000000-0000-4000-8000-000000000001";
const INV = "20000000-0000-4000-8000-000000000001";
const ACT = "30000000-0000-4000-8000-000000000001";
const REQUEST = "40000000-0000-4000-8000-000000000001";
const DOC = "50000000-0000-4000-8000-000000000001";
const OTHER = "90000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const scope = { organization_id: ORG, invoice_id: INV, act_date: "2026-09-29" };
const createInput = { ...scope, source_sha256: HASH, request_id: REQUEST };
const ctx: InvoiceContext = { isAuthenticated: () => true, getToken: () => "caller-jwt" };
const source = { organization_id: ORG, invoice_id: INV, invoice_number: "СЧ-2026/001", invoice_date: "2026-09-15",
  amount_kopecks: 300099, plan: "start", period_months: 1, status: "pending", paid_at: null, buyer_is_override: true,
  buyer: { name: "Другой покупатель <script>", inn: "1234567890", kpp: null, director_name: null, director_position: null } };
const legacy = { id: DOC, name: `Существующий акт\u200B<inv:${INV}>\u200B`, file_url: `${ORG}/acts/legacy.html`, status: "legacy_existing" };
const data = (response: Awaited<ReturnType<typeof previewSintagmaInvoiceAct>>) => response.structuredContent!;

function fake(options: { error?: string; foreign?: boolean; legacy?: boolean; pending?: boolean; corrupt?: boolean;
  uploadFails?: boolean; downloadFails?: boolean; finalLegacy?: boolean; sourceHash?: string } = {}) {
  let bytes: Blob | null = null;
  let saved: Record<string, unknown> | null = null;
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (options.error) return { error: { message: options.error }, data: null };
    if (name === "sintagma_search_billing_organizations") return { data: { organizations: [
      { id: ORG, name: "Client", inn: "123", kpp: null, generated_password: "secret" },
    ] }, error: null };
    if (name === "sintagma_platform_act_source") return { data: {
      source: { ...source, organization_id: options.foreign ? OTHER : ORG }, source_sha256: options.sourceHash ?? HASH,
      act_number: `А-${source.invoice_number}`, existing_act: saved,
      legacy_act: options.legacy ? legacy : null,
    }, error: null };
    if (name === "sintagma_prepare_platform_invoice_act") {
      const replayed = Boolean(saved);
      if (!saved) saved = { id: ACT, request_id: args.p_request_id, organization_id: ORG, invoice_id: INV,
        act_number: `А-${source.invoice_number}`, act_date: args.p_act_date, source_snapshot: source,
        source_sha256: HASH, html_snapshot: args.p_html, html_sha256: await sha256(new TextEncoder().encode(String(args.p_html))),
        storage_path: `${ORG}/acts/api/${ACT}.html`, document_name: "Act", status: "pending", billing_document_id: null };
      return { data: { act: saved, replayed }, error: null };
    }
    if (name === "sintagma_finalize_platform_invoice_act") {
      if (options.finalLegacy) return { data: { legacy_act: legacy }, error: null };
      saved = { ...saved, status: "ready", billing_document_id: DOC };
      return { data: saved, error: null };
    }
    throw new Error("unexpected rpc");
  });
  const upload = vi.fn(async (_path: string, blob: Blob) => {
    calls.push("upload");
    if (!options.uploadFails && !bytes) bytes = blob;
    return { error: options.uploadFails ? { message: "private storage failure" } : null };
  });
  const download = vi.fn(async () => {
    calls.push("download");
    return { data: options.corrupt ? new Blob(["different content"]) : bytes,
      error: options.downloadFails ? { message: "private storage failure" } : null };
  });
  const sign = vi.fn(async () => ({ data: { signedUrl: "https://storage.example.invalid/signed" }, error: null }));
  const db = { rpc, storage: { from: vi.fn(() => ({ upload, download, createSignedUrl: sign })) } } as unknown as SupabaseClient;
  return { rpc, upload, download, sign, db, calls, factory: vi.fn(() => db), options };
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("platform act boundary", () => {
  it("rejects anonymous and missing caller JWT before database", async () => {
    const f = fake();
    for (const user of [{ ...ctx, isAuthenticated: () => false }, { ...ctx, getToken: () => "" }]) {
      expect(data(await createSintagmaInvoiceAct(createInput, user, f.factory)).error).toBe("unauthorized");
    }
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("enforces strict dates, exact IDs, and disallows amount/payer/html inputs", async () => {
    const f = fake();
    for (const input of [{ ...createInput, amount: 1 }, { ...createInput, html: "malicious" },
      { ...createInput, buyer_name: "override" }, { ...createInput, act_date: "2026-02-30" },
      { ...createInput, organization_id: "*" }]) {
      expect(data(await createSintagmaInvoiceAct(input, ctx, f.factory)).error).toBe("invalid_input");
    }
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("honors authoritative admin/blocked refusal without exposing DB details", async () => {
    for (const error of ["platform_admin_required", "sensitive-secret-database-message"]) {
      const f = fake({ error });
      const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
      expect(response.error).toBe(error === "platform_admin_required" ? error : "platform_act_unavailable");
      expect(f.upload).not.toHaveBeenCalled();
    }
  });
  it("does not recreate an API act whose document was moved to trash", async () => {
    const f = fake({ error: "act_in_trash" });
    expect(data(await createSintagmaInvoiceAct(createInput, ctx, f.factory)).error).toBe("act_in_trash");
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("uses the caller JWT and publishable key, never service role", async () => {
    const f = fake();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-use");
    vi.mocked(createClient).mockReturnValue(f.db as ReturnType<typeof createClient>);
    await searchSintagmaBillingOrganizations({ query: "Client" }, ctx);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "public-key", {
      global: { headers: { Authorization: "Bearer caller-jwt" } }, auth: { persistSession: false, autoRefreshToken: false },
    });
  });
  it("falls back to the public anon key while retaining caller JWT", async () => {
    const f = fake();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("SUPABASE_ANON_KEY", "legacy-public-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-use");
    vi.mocked(createClient).mockReturnValue(f.db as ReturnType<typeof createClient>);
    const response = await searchSintagmaBillingOrganizations({ query: "Client" }, ctx);
    expect(response.isError).not.toBe(true);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "legacy-public-anon-key", {
      global: { headers: { Authorization: "Bearer caller-jwt" } }, auth: { persistSession: false, autoRefreshToken: false },
    });
  });
  it("rejects source crossing organization scope", async () => {
    const f = fake({ foreign: true });
    expect(data(await createSintagmaInvoiceAct(createInput, ctx, f.factory)).error).toBe("source_scope_mismatch");
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("allowlists organization search results", async () => {
    const f = fake();
    const response = data(await searchSintagmaBillingOrganizations({ query: "Client" }, ctx, f.factory));
    expect(JSON.stringify(response)).not.toContain("secret");
    expect(f.rpc).toHaveBeenCalledWith("sintagma_search_billing_organizations", { p_query: "Client", p_limit: 20, p_offset: 0 });
  });
});

describe("preview and source truth", () => {
  it("keeps source amount, buyer override, blank director and escapes HTML without writes", async () => {
    const f = fake();
    const response = data(await previewSintagmaInvoiceAct(scope, ctx, f.factory));
    expect(response.status).toBe("preview");
    expect(response.source).toEqual(source);
    expect(response.preview_html).toContain("Другой покупатель &lt;script&gt;");
    expect(response.preview_html).toContain("3000 руб. 99 коп.");
    expect(response.preview_html).toContain("Счёт № СЧ-2026/001 от 15.09.2026");
    expect(response.preview_html).not.toContain("data:image");
    expect(response.preview_images_omitted).toBe(true);
    expect(String(response.preview_html).length).toBeLessThan(10000);
    expect(f.calls).toEqual(["sintagma_platform_act_source"]);
  });
  it("refuses changed source before saving", async () => {
    const f = fake({ sourceHash: "b".repeat(64) });
    expect(data(await createSintagmaInvoiceAct(createInput, ctx, f.factory)).error).toBe("invoice_source_changed");
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("returns a legacy linked act without generating a duplicate", async () => {
    const f = fake({ legacy: true });
    const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
    expect(response.status).toBe("existing_legacy_act");
    expect(JSON.stringify(response.act)).not.toContain("<inv:");
    expect(f.calls).toEqual(["sintagma_platform_act_source"]);
    expect(f.upload).not.toHaveBeenCalled();
  });
});

describe("storage verification and retry", () => {
  it("uploads without overwrite, downloads/hash-checks, then finalizes a visible document", async () => {
    const f = fake();
    const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
    expect(response.status).toBe("saved");
    expect(response.bytes_verified).toBe(true);
    expect(response.sent_to_client).toBe(false);
    expect(f.calls).toEqual(["sintagma_platform_act_source", "sintagma_prepare_platform_invoice_act", "upload", "download", "sintagma_finalize_platform_invoice_act"]);
    expect(f.upload.mock.calls[0][1]).toBeInstanceOf(Blob);
    expect(f.upload).toHaveBeenCalledWith(`${ORG}/acts/api/${ACT}.html`, expect.any(Blob), { contentType: "text/html;charset=utf-8", upsert: false });
    expect(JSON.stringify(response)).not.toContain("data:image");
  });
  it("does not finalize or report saved when upload cannot be verified", async () => {
    const f = fake({ uploadFails: true, downloadFails: true });
    const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
    expect(response.status).toBe("pending_storage");
    expect(f.calls).not.toContain("sintagma_finalize_platform_invoice_act");
  });
  it("recovers the same pending snapshot and retains original bytes after source change", async () => {
    const f = fake({ uploadFails: true });
    await createSintagmaInvoiceAct(createInput, ctx, f.factory);
    f.options.uploadFails = false;
    f.options.sourceHash = "b".repeat(64);
    const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
    expect(response.status).toBe("saved");
    expect(response.replayed).toBe(true);
    expect(response.created).toBe(false);
  });
  it("never overwrites a conflicting object or registers it as ready", async () => {
    const f = fake({ corrupt: true });
    expect(data(await createSintagmaInvoiceAct(createInput, ctx, f.factory)).error).toBe("artifact_hash_mismatch");
    expect(f.calls).not.toContain("sintagma_finalize_platform_invoice_act");
  });
  it("handles a legacy UI act winning the race before finalization", async () => {
    const f = fake({ finalLegacy: true });
    const response = data(await createSintagmaInvoiceAct(createInput, ctx, f.factory));
    expect(response.status).toBe("existing_legacy_act");
    expect(response.created).toBe(false);
  });
});
