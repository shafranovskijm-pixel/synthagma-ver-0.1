import { describe, expect, it, vi } from "vitest";
import { persistGroupDocumentOperation, readGroupDocumentOperation, validateGroupDocumentOperationReceipt, type GroupDocumentOperationScope } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocumentOperation";
const scope: GroupDocumentOperationScope = { actorId: "actor", organizationId: "org", groupId: "group", operationId: "operation" };
const receipt = () => ({ operationId: "operation", batch: { batch_id: "batch", batch_version: 1, inserted_count: 9 }, document: { doc_type: "class_journal", name: "Журнал", file_path: "organizations/org/group-documents/group/journal.docx", docx_sha256: "A".repeat(64) }, warnings: ["Черновик"] });
const args = { p_actor_id: "actor", p_organization_id: "org", p_group_id: "group", p_operation_id: "operation" };
describe("durable document operation RPC contract", () => {
  it("accepts a complete scoped receipt", () => { expect(validateGroupDocumentOperationReceipt(receipt(), scope)).toEqual(receipt()); });
  it("null status is unknown and does not invoke persistence", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await readGroupDocumentOperation({ rpc }, scope)).toBeNull();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_goreltech_document_operation", args);
  });
  it.each(["operation", "orgpath", "grouppath", "count", "version", "hash", "type", "warnings", "batch"])("rejects invalid receipt %s", kind => {
    const value = receipt();
    if (kind === "operation") value.operationId = "other";
    if (kind === "orgpath") value.document.file_path = "organizations/foreign/group-documents/group/a.docx";
    if (kind === "grouppath") value.document.file_path = "organizations/org/group-documents/foreign/a.docx";
    if (kind === "count") value.batch.inserted_count = 8;
    if (kind === "version") value.batch.batch_version = 0;
    if (kind === "hash") value.document.docx_sha256 = "broken";
    if (kind === "type") value.document.doc_type = "pass";
    if (kind === "batch") value.batch.batch_id = "";
    expect(() => validateGroupDocumentOperationReceipt(kind === "warnings" ? { ...value, warnings: [1] } : value, scope)).toThrow();
  });
  it("calls the write RPC exactly once and accepts the previously committed payload", async () => {
    const oldReceipt = receipt(); const rpc = vi.fn().mockResolvedValue({ data: oldReceipt, error: null });
    expect(await persistGroupDocumentOperation({ rpc }, scope, [{ newPayload: true }], ["new warning"])).toEqual(oldReceipt);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_goreltech_group_document_batch_once", { ...args, p_docs: [{ newPayload: true }], p_warnings: ["new warning"] });
  });
  it.each(["throw", "error"])("reconciles lost response %s only with read-only getter", async kind => {
    const rpc = vi.fn();
    if (kind === "throw") rpc.mockRejectedValueOnce(new Error("network")); else rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    rpc.mockResolvedValueOnce({ data: receipt(), error: null });
    expect(await persistGroupDocumentOperation({ rpc }, scope, [], [])).toEqual(receipt());
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_goreltech_group_document_batch_once", "get_goreltech_document_operation"]);
    expect(rpc.mock.calls[1][1]).toEqual(args);
  });
  it("unknown after write error remains an uncertain failure with no retry", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: {} }).mockResolvedValueOnce({ data: null, error: null });
    await expect(persistGroupDocumentOperation({ rpc }, scope, [], [])).rejects.toThrow("ещё могла выполняться"); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([null, true, {}, { ...receipt(), batch: { batch_id: "x", batch_version: 1, inserted_count: 0 } }])("malformed successful acknowledgement %# is not retried", async value => {
    const rpc = vi.fn().mockResolvedValue({ data: value, error: null });
    await expect(persistGroupDocumentOperation({ rpc }, scope, [], [])).rejects.toThrow(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["throw", "error"])("getter %s is never interpreted as no operation", async kind => {
    const rpc = vi.fn(); if (kind === "throw") rpc.mockRejectedValue(new Error("network")); else rpc.mockResolvedValue({ data: null, error: {} });
    await expect(readGroupDocumentOperation({ rpc }, scope)).rejects.toThrow(); expect(rpc).toHaveBeenCalledTimes(1);
  });
});
