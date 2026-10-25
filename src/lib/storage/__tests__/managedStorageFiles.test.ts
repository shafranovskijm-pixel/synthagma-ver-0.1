import { afterEach, describe, expect, it, vi } from "vitest";
import { loadManagedStorageEntries, MANAGED_PRIVATE_BUCKETS, managedObjectPath, managedStorageReference } from '../managedStorageFiles.ts';
const ORG = "org-a";
const BASE = "https://project.supabase.co";
const stored = (name: string, size = 10) => ({ id: name, name, metadata: { size }, created_at: "2026-10-21T00:00:00Z" });
function fixture(rows: Record<string, any[]> = {}, list: (bucket: string, prefix: string, options: any, parameters?: { signal?: AbortSignal }) => any = () => ({ data: [], error: null })) {
  const queries: Array<{ table: string; filters: any[]; range?: number[] }> = [];
  const client = {
    from: vi.fn((table: string) => {
      const call = { table, filters: [] as any[], range: undefined as number[] | undefined }; queries.push(call);
      const query: any = { select: vi.fn(() => query), eq: vi.fn((...args) => { call.filters.push(["eq", ...args]); return query; }),
        in: vi.fn((...args) => { call.filters.push(["in", ...args]); return query; }), is: vi.fn((...args) => { call.filters.push(["is", ...args]); return query; }),
        order: vi.fn(() => query), range: vi.fn((start, end) => { call.range = [start, end]; return query; }),
        abortSignal: vi.fn(() => Promise.resolve({ data: (rows[table] || []).slice(call.range![0], call.range![1] + 1), error: null })) };
      return query;
    }),
    storage: { from: vi.fn((bucket: string) => ({ list: vi.fn((prefix, options, parameters) => list(bucket, prefix, options, parameters)) })) },
  };
  return { client, queries };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("managed organization storage", () => {
  it("requires signing for every confirmed private bucket", () => {
    expect([...MANAGED_PRIVATE_BUCKETS].sort()).toEqual(["billing-documents", "company-documents", "library-files", "org-documents", "student-documents"]);
    expect(MANAGED_PRIVATE_BUCKETS.has("course-files")).toBe(false);
  });
  it("uses exact trusted locators without signed tokens and rejects foreign or unsafe paths", () => {
    expect(managedStorageReference(BASE + "/storage/v1/object/sign/company-documents/company-a/report%20one.pdf?token=old#hash", "company-documents", BASE)).toBe("company-a/report one.pdf");
    expect(managedStorageReference("https://foreign.example/storage/v1/object/public/company-documents/company-a/secret.pdf", "company-documents", BASE)).toBeNull();
    for (const path of ["", "/root.pdf", "org-a/../secret.pdf", "org-a//x.pdf", "org-a/%2e%2e/x.pdf", "org-a/a?token=x", "org-a/a\\b.pdf"]) expect(managedStorageReference(path, "company-documents", BASE)).toBeNull();
    expect(managedObjectPath({ folder: "org-a", name: "../secret.pdf" })).toBeNull();
  });
  it("discovers company and student files from scoped metadata without per-user/root listing", async () => {
    const list = vi.fn((bucket: string, prefix: string) => Promise.resolve({ data: [], error: null }));
    const f = fixture({
      companies: [{ id: "company-a" }],
      company_documents: [
        { id: "a", company_id: "company-a", file_path: "company-a/contract.pdf", file_size: 24 },
        { id: "b", company_id: "company-a", file_url: BASE + "/storage/v1/object/public/billing-documents/org-a/invoice.pdf", file_size: 50 },
        { id: "bad", company_id: "company-foreign", file_path: "company-foreign/secret.pdf" },
      ],
      student_identity_documents: [
        { id: "s", user_id: "user-a", file_path: "user-a/passport.pdf" },
        { id: "bad", user_id: "user-a", file_path: "user-foreign/passport.pdf" },
      ],
      student_documents: [
        { id: "e", enrollment_id: "enroll-a", file_url: "students/enroll-a/certificate.pdf", enrollments: { courses: { organization_id: ORG } } },
        { id: "bad", enrollment_id: "enroll-foreign", file_url: "students/enroll-foreign/secret.pdf", enrollments: { courses: { organization_id: "foreign" } } },
      ],
    }, list);
    const result = await loadManagedStorageEntries(f.client, ORG, BASE);
    expect(result.errors).toEqual([]);
    expect(result.entries.map(e => e.bucket + "/" + e.path).sort()).toEqual([
      "billing-documents/org-a/invoice.pdf", "company-documents/company-a/contract.pdf",
      "student-documents/students/enroll-a/certificate.pdf", "student-documents/user-a/passport.pdf",
    ]);
    expect(f.client.from).not.toHaveBeenCalledWith("profiles");
    expect(f.queries.find(q => q.table === "companies")?.filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(f.queries.find(q => q.table === "student_identity_documents")?.filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(f.queries.find(q => q.table === "student_documents")?.filters).toContainEqual(["eq", "enrollments.courses.organization_id", ORG]);
    expect(f.queries.find(q => q.table === "company_documents")?.filters).toContainEqual(["in", "company_id", ["company-a"]]);
    expect(list.mock.calls.some(([bucket]) => ["company-documents", "student-documents"].includes(bucket))).toBe(false);
    expect(list.mock.calls.every(([, prefix]) => !!prefix && prefix !== "/")).toBe(true);
  });
  it("retains standalone org uploads over independent refreshes and deduplicates metadata/list references", async () => {
    const list = vi.fn((bucket, prefix) => Promise.resolve({ data: bucket === "course-files" && prefix === ORG ? [stored("standalone.pdf")] : bucket === "billing-documents" && prefix === ORG ? [stored("invoice.pdf", 60)] : [], error: null }));
    const f = fixture({ companies: [{ id: "company-a" }], company_documents: [{ id: "b", company_id: "company-a", file_path: "org-a/invoice.pdf", file_size: 50 }] }, list);
    const first = await loadManagedStorageEntries(f.client, ORG, BASE);
    const refreshed = await loadManagedStorageEntries(f.client, ORG, BASE);
    for (const result of [first, refreshed]) {
      expect(result.entries.filter(e => e.path === "org-a/standalone.pdf")).toHaveLength(1);
      expect(result.entries.filter(e => e.path === "org-a/invoice.pdf")).toHaveLength(1);
      expect(result.entries.find(e => e.path === "org-a/invoice.pdf")?.size).toBe(60);
    }
  });
  it("paginates metadata and lists past the first500 rows with explicit offsets", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: "row-" + i, user_id: "user-" + i, file_path: "user-" + i + "/id.pdf" }));
    const list = vi.fn((bucket, prefix, options) => Promise.resolve({ data: bucket === "course-files" && prefix === ORG ? options.offset === 0 ? Array.from({ length: 500 }, (_, i) => stored("f" + i + ".pdf")) : [stored("f500.pdf")] : [], error: null }));
    const f = fixture({ student_identity_documents: rows }, list);
    const result = await loadManagedStorageEntries(f.client, ORG, BASE);
    expect(result.entries.filter(e => e.bucket === "student-documents")).toHaveLength(501);
    expect(result.entries.filter(e => e.bucket === "course-files")).toHaveLength(501);
    expect(f.queries.filter(q => q.table === "student_identity_documents").map(q => q.range)).toEqual([[0, 499], [500, 999]]);
    expect(list).toHaveBeenCalledWith("course-files", ORG, expect.objectContaining({ offset: 500, limit: 500 }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("reports returned list errors instead of claiming complete empty storage", async () => {
    const f = fixture({}, (bucket) => Promise.resolve({ data: [], error: bucket === "billing-documents" ? { message: "denied" } : null }));
    const result = await loadManagedStorageEntries(f.client, ORG, BASE);
    expect(result.entries).toEqual([]);
    expect(result.errors).toContain("billing-documents");
  });
  it("bounds folder scan concurrency to3 and ends a hung scan at the45second load deadline", async () => {
    vi.useFakeTimers(); let active = 0; let maximum = 0;
    const list = vi.fn((bucket: string, prefix: string, options: any, parameters?: { signal?: AbortSignal }) => {
      active++; maximum = Math.max(active, maximum);
      parameters?.signal?.addEventListener("abort", () => { active--; }, { once: true });
      return new Promise(() => {});
    });
    const f = fixture({ courses: Array.from({ length: 42 }, (_, i) => ({ id: "course-" + i })) }, list);
    const pending = loadManagedStorageEntries(f.client, ORG, BASE);
    await vi.advanceTimersByTimeAsync(1);
    expect(maximum).toBe(3);
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await pending;
    expect(maximum).toBeLessThanOrEqual(3);
    expect(active).toBe(0);
    expect(result.errors).toContain("load_deadline_or_cancelled");
    // Timed-out SDK calls cannot add late files; no further work starts after the load budget.
    const requests = list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(list.mock.calls.length).toBe(requests);
  });
  it("does not query or scan any storage without a safe organization scope", async () => {
    const f = fixture();
    expect(await loadManagedStorageEntries(f.client, "../foreign", BASE)).toEqual({ entries: [], errors: ["organization_scope"] });
    expect(f.client.from).not.toHaveBeenCalled(); expect(f.client.storage.from).not.toHaveBeenCalled();
  });
});
