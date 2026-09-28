import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { approvedStoragePath, getSintagmaInvoiceExport, INVOICE_COLUMNS, searchSintagmaInvoices, type InvoiceContext } from "./invoice-source";
import searchTool from "./tools/search-sintagma-invoices";
import exportTool from "./tools/get-sintagma-invoice-export";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
const ORG = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const COMPANY = "20000000-0000-4000-8000-000000000001";
const ID = "30000000-0000-4000-8000-000000000001";
const ID2 = "30000000-0000-4000-8000-000000000002";
const ctx: InvoiceContext = { isAuthenticated: () => true, getToken: () => "verified-user-token" };
const scope = { source_kind: "org_billing_document", organization_id: ORG };
type Row = Record<string, unknown>;
type QueryCall = { table: string; columns: string; filters: Array<[string, unknown]>; search?: [string, string]; range?: [number, number] };

function fakeDb(rows: Record<string, Row[]> = {}, options: { allowed?: boolean; permissionError?: boolean; readError?: boolean; storageError?: boolean } = {}) {
  const calls: QueryCall[] = [];
  const records = {
    organizations: [{ id: ORG, name: "Test client", inn: "0000000000", email: "test@example.invalid", secret: "never-return" }],
    companies: [{ id: COMPANY, organization_id: ORG, name: "Test company", generated_password: "never-return" }],
    ...rows,
  };
  const rpc = vi.fn(async () => ({ data: options.allowed !== false, error: options.permissionError ? { message: "sensitive database details" } : null }));
  const sign = vi.fn(async (path: string, expires: number) => ({ data: options.storageError ? null : { signedUrl: `https://storage.example.invalid/${path}?token=test&expires=${expires}` }, error: options.storageError ? { message: "private path" } : null }));
  const bucket = vi.fn(() => ({ createSignedUrl: sign }));
  const db = {
    rpc, storage: { from: bucket },
    from: (table: string) => {
      const call: QueryCall = { table, columns: "", filters: [] };
      let single = false;
      calls.push(call);
      const resolve = () => {
        let data = (records[table] ?? []).filter(row => call.filters.every(([key, value]) => value === null ? row[key] == null : row[key] === value));
        if (call.search) {
          const [column, pattern] = call.search;
          const literal = pattern.slice(1, -1).replace(/\\([\\%_])/g, "$1").toLowerCase();
          data = data.filter(row => String(row[column] ?? "").toLowerCase().includes(literal));
        }
        if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
        return { data, error: options.readError ? { message: "secret-error-details" } : null };
      };
      const query = {
        select: (columns: string) => { call.columns = columns; return query; },
        overrideTypes: () => query,
        eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
        is: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
        ilike: (key: string, value: string) => { call.search = [key, value]; return query; },
        order: () => query,
        range: (start: number, end: number) => { call.range = [start, end]; return query; },
        maybeSingle: () => { single = true; return query; },
        then: (callback: (value: unknown) => unknown) => {
          const response = resolve();
          return Promise.resolve({ ...response, data: single ? response.data[0] ?? null : response.data }).then(callback);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const factory = vi.fn(() => db);
  return { db, calls, factory, rpc, sign, bucket };
}
function content(response: Awaited<ReturnType<typeof searchSintagmaInvoices>>) {
  return response.structuredContent as {
    error?: string; invoice?: Row; invoices?: Row[]; artifact?: Row; next_offset?: number | null;
  };
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network is forbidden in these tests"); })); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("authorization and explicit scope", () => {
  it("refuses anonymous callers before creating a database client", async () => {
    const f = fakeDb();
    const anonymous = { ...ctx, isAuthenticated: () => false };
    expect(content(await searchSintagmaInvoices(scope, anonymous, f.factory))).toEqual({ error: "unauthorized" });
    expect(content(await getSintagmaInvoiceExport({ ...scope, source_id: ID }, anonymous, f.factory))).toEqual({ error: "unauthorized" });
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("refuses missing tokens and invalid or inconsistent scope before data access", async () => {
    const f = fakeDb();
    expect(content(await searchSintagmaInvoices(scope, { ...ctx, getToken: () => "" }, f.factory)).error).toBe("unauthorized");
    for (const input of [{ source_kind: "subscription_invoice" }, { ...scope, organization_id: "*" }, { ...scope, company_id: COMPANY }, { ...scope, source_kind: "company_document" }, { ...scope, arbitrary_url: "https://example.invalid" }]) {
      expect((await searchSintagmaInvoices(input, ctx, f.factory)).isError).toBe(true);
    }
    expect(f.factory).not.toHaveBeenCalled();
  });
  it("passes the user JWT and requires documents.read for the exact organization", async () => {
    const f = fakeDb({}, { allowed: false });
    const response = await searchSintagmaInvoices(scope, ctx, f.factory);
    expect(content(response).error).toBe("forbidden");
    expect(f.factory).toHaveBeenCalledWith("verified-user-token");
    expect(f.rpc).toHaveBeenCalledWith("can_access_organization", { _organization_id: ORG, _permission: "documents.read" });
    expect(f.calls).toHaveLength(0);
  });
  it("rejects a company belonging to a different organization", async () => {
    const f = fakeDb({ companies: [{ id: COMPANY, organization_id: OTHER }] });
    const response = await searchSintagmaInvoices({ source_kind: "company_document", organization_id: ORG, company_id: COMPANY }, ctx, f.factory);
    expect(content(response).error).toBe("scope_not_found");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].filters).toEqual([["id", COMPANY], ["organization_id", ORG]]);
  });
  it("constructs the production client with the caller JWT and publishable key only", async () => {
    const f = fakeDb();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-use");
    vi.mocked(createClient).mockReturnValue(f.db as unknown as ReturnType<typeof createClient>);
    await searchSintagmaInvoices(scope, ctx);
    expect(createClient).toHaveBeenCalledWith("https://example.invalid", "test-publishable-key", {
      global: { headers: { Authorization: "Bearer verified-user-token" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("search and bounded projections", () => {
  it("filters tenant, document type and deleted rows, and leaves unknown metadata null", async () => {
    const f = fakeDb({ org_billing_documents: [
      { id: ID, organization_id: ORG, name: "Invoice", doc_type: "invoice", deleted_at: null, file_url: `${ORG}/original.pdf` },
      { id: ID2, organization_id: OTHER, doc_type: "invoice" },
      { id: ID2, organization_id: ORG, doc_type: "act" },
      { id: ID2, organization_id: ORG, doc_type: "invoice", deleted_at: "2026-01-01" },
    ] });
    const response = content(await searchSintagmaInvoices(scope, ctx, f.factory));
    expect(response.invoices).toHaveLength(1);
    expect(response.invoices?.[0]).toMatchObject({ source_id: ID, invoice_number: null, invoice_date: null, amount: null, sha256: null, content_type: null });
    expect(JSON.stringify(response)).not.toMatch(/never-return|file_url|original.pdf/);
    expect(f.calls[1].columns).toBe(INVOICE_COLUMNS.org_billing_document);
    expect(f.calls.every(call => !call.columns.includes("*") && !call.columns.includes("password"))).toBe(true);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("escapes SQL wildcard searches and paginates using an extra row", async () => {
    const f = fakeDb({ subscription_invoices: [ID, ID2].map(id => ({ id, organization_id: ORG, invoice_number: "100%_invoice" })) });
    const response = content(await searchSintagmaInvoices({ ...scope, source_kind: "subscription_invoice", query: "100%_", limit: 1 }, ctx, f.factory));
    expect(f.calls[1].search).toEqual(["invoice_number", "%100\\%\\_%"]);
    expect(f.calls[1].range).toEqual([0, 1]);
    expect(response.invoices).toHaveLength(1);
    expect(response.next_offset).toBe(1);
  });
  it("requires a bounded valid limit", async () => {
    const f = fakeDb();
    for (const limit of [0, 51, 1.5]) expect(content(await searchSintagmaInvoices({ ...scope, limit }, ctx, f.factory)).error).toBe("invalid_input");
    expect(f.factory).not.toHaveBeenCalled();
  });
});

describe("export of an existing document", () => {
  it("returns artifact_missing for subscription rows and never synthesizes or signs a PDF", async () => {
    const f = fakeDb({ subscription_invoices: [{ id: ID, organization_id: ORG, invoice_number: "293/2026", invoice_date: "2026-09-23", amount: 3000 }] });
    const response = content(await getSintagmaInvoiceExport({ ...scope, source_kind: "subscription_invoice", source_id: ID }, ctx, f.factory));
    expect(response.invoice).toMatchObject({ invoice_number: "293/2026", amount: 3000 });
    expect(response.artifact).toEqual({ status: "artifact_missing", reason: "subscription_record_has_no_original_file", signed_download_url: null });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it.each([`${ORG}/original.pdf`, `organizations/${ORG}/group/original.pdf`])("signs only approved org storage paths: %s", async path => {
    const f = fakeDb({ org_billing_documents: [{ id: ID, organization_id: ORG, doc_type: "invoice", file_url: path }] });
    const response = content(await getSintagmaInvoiceExport({ ...scope, source_id: ID }, ctx, f.factory));
    expect(f.bucket).toHaveBeenCalledWith("billing-documents");
    expect(f.sign).toHaveBeenCalledWith(path, 120);
    expect(response.artifact).toMatchObject({ status: "download_link_issued", expires_in_seconds: 120, bytes_verified: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the company object key, never the arbitrary file_url or company secrets", async () => {
    const path = `company-documents/${COMPANY}/invoice.pdf`;
    const f = fakeDb({ company_documents: [{ id: ID, company_id: COMPANY, type: "invoice", file_path: path, file_url: "https://attacker.invalid/private", amount: 3000, file_size: 123 }] });
    const response = content(await getSintagmaInvoiceExport({ source_kind: "company_document", organization_id: ORG, company_id: COMPANY, source_id: ID }, ctx, f.factory));
    expect(f.bucket).toHaveBeenCalledWith("documents");
    expect(f.sign).toHaveBeenCalledWith(path, 120);
    expect(f.calls[1].filters).toEqual([["company_id", COMPANY], ["type", "invoice"], ["deleted_at", null], ["id", ID]]);
    expect(response.invoice).toMatchObject({ invoice_number: null, amount: 3000, file_size: 123 });
    expect(JSON.stringify(response)).not.toMatch(/never-return|attacker|generated_password/);
  });
  it.each([`https://attacker.invalid/${ORG}/file.pdf`, `${OTHER}/file.pdf`, `${ORG}/../file.pdf`, `${ORG}/%2e%2e/file.pdf`, `${ORG}\\file.pdf`, `${ORG}/file.pdf?token=x`, `${ORG}//file.pdf`, `${ORG}/`])("refuses unsafe/foreign paths: %s", async path => {
    expect(approvedStoragePath({ file_url: path }, { ...scope, source_kind: "org_billing_document" })).toBeNull();
    const f = fakeDb({ org_billing_documents: [{ id: ID, organization_id: ORG, doc_type: "invoice", file_url: path }] });
    expect(content(await getSintagmaInvoiceExport({ ...scope, source_id: ID }, ctx, f.factory)).artifact?.status).toBe("artifact_missing");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("cannot export a different tenant or a deleted/non-invoice record by ID", async () => {
    for (const row of [{ organization_id: OTHER, doc_type: "invoice" }, { organization_id: ORG, doc_type: "act" }, { organization_id: ORG, doc_type: "invoice", deleted_at: "2026-01-01" }]) {
      const f = fakeDb({ org_billing_documents: [{ id: ID, file_url: `${ORG}/file.pdf`, ...row }] });
      expect(content(await getSintagmaInvoiceExport({ ...scope, source_id: ID }, ctx, f.factory)).error).toBe("invoice_not_found");
      expect(f.sign).not.toHaveBeenCalled();
    }
  });
  it("does not leak storage or database errors", async () => {
    const f = fakeDb({ org_billing_documents: [{ id: ID, organization_id: ORG, doc_type: "invoice", file_url: `${ORG}/file.pdf` }] }, { storageError: true });
    expect(content(await getSintagmaInvoiceExport({ ...scope, source_id: ID }, ctx, f.factory))).toEqual({ error: "artifact_unavailable" });
    const failed = fakeDb({}, { permissionError: true });
    expect(content(await searchSintagmaInvoices(scope, ctx, failed.factory))).toEqual({ error: "access_check_failed" });
  });
  it("declares both registered tools as read-only and requires explicit scope", () => {
    expect([searchTool.name, exportTool.name]).toEqual(["search_sintagma_invoices", "get_sintagma_invoice_export"]);
    for (const tool of [searchTool, exportTool]) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
      expect(tool.inputSchema?.organization_id.safeParse(undefined).success).toBe(false);
      expect(tool.inputSchema?.source_kind.safeParse(undefined).success).toBe(false);
    }
  });
});
