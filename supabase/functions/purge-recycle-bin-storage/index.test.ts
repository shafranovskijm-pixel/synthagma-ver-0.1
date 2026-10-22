// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function actualHandler(missingKey = false) {
  const removed = vi.fn(async () => ({ error: null }));
  const deleted = vi.fn(async () => ({ error: null }));
  const bucket = vi.fn(() => ({ remove: removed }));
  const from = vi.fn((table: string) => {
    // If org_documents enters this generic purge again, these legacy/versioned
    // fixtures expose a real attempted removal; do not hide it behind an error.
    const rows = table === "org_documents"
      ? [{ id: "legacy", file_url: "https://example.test/storage/v1/object/public/org-documents/org/old.pdf" },
        { id: "versioned", file_url: "https://example.test/storage/v1/object/public/org-documents/org/versions/doc/request.pdf" }]
      : table === "document_signatures" ? [{ id: "signed", signed_document_path: "org/signed.pdf", document_snapshot_url: "org/source.pdf" }]
      : table === "document_issuance_log" ? [{ id: "issued", file_url: "org/student/diploma.pdf" }]
      : ["education_document_records", "commercial_proposals"].includes(table) ? [{ id: "unrelated" }] : [];
    const query = { select: () => query, lt: () => query, not: () => query,
      limit: async () => ({ data: rows, error: null }), delete: () => query,
      in: (column: string, ids: string[]) => deleted(table, column, ids) };
    return query;
  });
  const source = readFileSync(resolve(process.cwd(), "supabase/functions/purge-recycle-bin-storage/index.ts"), "utf8");
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const stripped = [...ast.statements.filter(ts.isImportDeclaration)].reverse().reduce(
    (text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end), source);
  const code = ts.transpileModule(stripped, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let handler!: (req: Request) => Promise<Response>;
  const createClient = vi.fn(() => ({ from, storage: { from: bucket } }));
  const dependencies = { createClient,
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (key: string) => missingKey && key === "SUPABASE_SERVICE_ROLE_KEY" ? undefined : "fixture" } }, console: { log() {} } };
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { handler, from, bucket, removed, deleted, createClient };
}
const request = (authorization: string | null = "Bearer fixture", method = "POST") => new Request("https://example.test/purge", {
  method, headers: authorization ? { Authorization: authorization } : {},
});

describe("recycle-bin cron preserves all organization document history", () => {
  it("does not query, delete or remove blobs of either legacy or versioned org documents", async () => {
    const f = actualHandler();
    const response = await f.handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Sintagma-Function-Revision")).toBe("uc-foundation-20261018-v1");
    const excludedTables = ["org_documents", "document_signatures", "document_issuance_log", "education_document_records"];
    expect(await response.json()).toMatchObject({ excludedTables });
    excludedTables.forEach(table => expect(f.from).not.toHaveBeenCalledWith(table));
    ["org-documents", "signed-documents", "student-documents"].forEach(bucket => expect(f.bucket).not.toHaveBeenCalledWith(bucket));
    expect(f.removed).not.toHaveBeenCalled();
    expect(f.deleted.mock.calls.every(call => !excludedTables.includes(call[0]))).toBe(true);
  });
  it("keeps the unrelated fileless cleanup path working", async () => {
    const f = actualHandler();
    const response = await f.handler(request());
    expect(await response.json()).toMatchObject({ report: { commercial_proposals: { rowsDeleted: 1, filesDeleted: 0, errors: [] } } });
    expect(f.deleted).toHaveBeenCalledWith("commercial_proposals", "id", ["unrelated"]);
  });
  it("returns a preflight response without accessing data", async () => {
    const f = actualHandler();
    const response = await f.handler(new Request("https://example.test/purge", { method: "OPTIONS" }));
    expect(response.status).toBe(200);
    expect(f.from).not.toHaveBeenCalled(); expect(f.removed).not.toHaveBeenCalled();
  });
  it.each([null, "Bearer user-jwt", "Bearer", "Bearer fixture-extra"])("denies an unauthorized caller before creating a service client: %s", async token => {
    const f = actualHandler();
    expect((await f.handler(request(token))).status).toBe(401);
    expect(f.createClient).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled(); expect(f.removed).not.toHaveBeenCalled();
  });
  it("fails closed when the service key is missing", async () => {
    const f = actualHandler(true);
    expect((await f.handler(request())).status).toBe(401);
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it("rejects GET even for the service caller before any data access", async () => {
    const f = actualHandler();
    expect((await f.handler(request("Bearer fixture", "GET"))).status).toBe(405);
    expect(f.createClient).not.toHaveBeenCalled();
  });
});
