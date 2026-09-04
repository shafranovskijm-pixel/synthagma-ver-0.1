import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { reconcileGroupDocumentPackage, type PackageReconciliationClient } from "../packageReconciliation";

const scope = { organizationId: "organization-a", groupId: "group-a" };
function document(index = 1) {
  return {
    id: `doc-${String(index).padStart(3, "0")}`, organization_id: scope.organizationId, group_id: scope.groupId,
    doc_type: "class_journal", name: `Журнал ${index}`, created_at: "2026-09-04T00:00:00Z", status: "active",
    variables: {}, html: null, file_path: `group-a/${index}.docx`, document_number: null, document_date: "2026-09-04",
    package_batch_id: "batch-1", package_version: 1, is_current: true,
  };
}
type Reply = { data: unknown; error: unknown; count: number | null };
function reader(replies: Reply[]) {
  const calls: unknown[][] = [];
  let page = 0;
  const query = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return query; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return query; },
    range: (...args: unknown[]) => { calls.push(["range", ...args]); return query; },
    then: <TResult1 = Reply, TResult2 = never>(
      onFulfilled?: ((reply: Reply) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> => Promise.resolve(replies[page++]).then(onFulfilled, onRejected),
  };
  const client: PackageReconciliationClient = { from: (table) => { calls.push(["from", table]); return query; } };
  return { client, calls };
}

describe("reconcileGroupDocumentPackage", () => {
  it("reads an exact scoped active list, returns its real current version and performs no mutation", async () => {
    const current = { ...document(2), package_batch_id: "batch-2", package_version: 2 };
    const prior = { ...document(), is_current: false };
    const { client, calls } = reader([{ data: [prior, current], error: null, count: 2 }]);
    const result = await reconcileGroupDocumentPackage(scope, client);
    expect(result.documents).toEqual([prior, current]);
    expect(result.currentVersion).toBe(2);
    expect(calls).toEqual([
      ["from", "group_documents"], ["select", "*", { count: "exact" }],
      ["eq", "organization_id", scope.organizationId], ["eq", "group_id", scope.groupId], ["eq", "status", "active"],
      ["order", "id", { ascending: true }], ["range", 0, 99],
    ]);
  });

  it("confirms a genuinely empty visible list without inventing a package version", async () => {
    const { client } = reader([{ data: [], error: null, count: 0 }]);
    expect(await reconcileGroupDocumentPackage(scope, client)).toEqual({ documents: [], currentVersion: null });
  });

  it("reads all pages and repeats tenant filters on every query", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => document(index));
    const { client, calls } = reader([
      { data: rows.slice(0, 100), error: null, count: 101 }, { data: rows.slice(100), error: null, count: 101 },
    ]);
    expect((await reconcileGroupDocumentPackage(scope, client)).documents).toHaveLength(101);
    expect(calls.filter(call => call[0] === "range")).toEqual([["range", 0, 99], ["range", 100, 199]]);
    expect(calls.filter(call => call[0] === "eq" && call[1] === "organization_id")).toHaveLength(2);
    expect(calls.filter(call => call[0] === "eq" && call[1] === "group_id")).toHaveLength(2);
  });

  it.each([
    { label: "backend error", reply: { data: [document()], error: { message: "database unavailable" }, count: 1 } },
    { label: "missing count", reply: { data: [document()], error: null, count: null } },
    { label: "partial page", reply: { data: [document()], error: null, count: 2 } },
    { label: "non-array data", reply: { data: {}, error: null, count: 0 } },
    { label: "foreign organization", reply: { data: [{ ...document(), organization_id: "other" }], error: null, count: 1 } },
    { label: "foreign group", reply: { data: [{ ...document(), group_id: "other" }], error: null, count: 1 } },
    { label: "inactive document", reply: { data: [{ ...document(), status: "deleted" }], error: null, count: 1 } },
    { label: "duplicate id", reply: { data: [document(), document()], error: null, count: 2 } },
    { label: "missing current flag", reply: { data: [{ ...document(), is_current: null }], error: null, count: 1 } },
    { label: "invalid version", reply: { data: [{ ...document(), package_version: 0 }], error: null, count: 1 } },
    { label: "same batch has conflicting versions", reply: { data: [document(), { ...document(2), package_version: 2 }], error: null, count: 2 } },
    { label: "invalid document date", reply: { data: [{ ...document(), document_date: "invalid" }], error: null, count: 1 } },
  ])("rejects $label instead of unlocking retry", async ({ reply }) => {
    const { client } = reader([reply]);
    await expect(reconcileGroupDocumentPackage(scope, client)).rejects.toThrow("Список документов не подтверждён");
  });

  it("rejects a changed count or failure after an already received page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => document(index));
    for (const secondPage of [
      { data: [document(100)], error: null, count: 102 },
      { data: [], error: { message: "timeout" }, count: 101 },
    ]) {
      const { client } = reader([{ data: firstPage, error: null, count: 101 }, secondPage]);
      await expect(reconcileGroupDocumentPackage(scope, client)).rejects.toThrow("Список документов не подтверждён");
    }
  });

  it("retains legacy unversioned documents without inventing current status", async () => {
    const legacy = { ...document(), package_batch_id: null, package_version: null, is_current: null, variables: null };
    const { client } = reader([{ data: [legacy], error: null, count: 1 }]);
    const result = await reconcileGroupDocumentPackage(scope, client);
    expect(result.documents).toEqual([{ ...legacy, variables: {} }]);
    expect(result.currentVersion).toBeNull();
  });
});
