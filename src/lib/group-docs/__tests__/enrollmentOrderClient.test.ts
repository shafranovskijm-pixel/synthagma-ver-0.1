import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeEnrollmentOrder, beginEnrollmentOrder, downloadEnrollmentOrder, enrollmentOrderStorageKey,
  ENROLLMENT_ORDER_REVISION, finalizeEnrollmentOrder, listEnrollmentOrders, previewEnrollmentOrder,
  readEnrollmentOrder, readPendingEnrollmentOrder, resumeEnrollmentOrder, type OrderScope,
} from "../enrollmentOrderIssue";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), proxy: vi.fn((url: string) => url) }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke }));
vi.mock("@/utils/proxyFetch", () => ({ proxiedAssetUrl: mocks.proxy }));
const scope: OrderScope = {
  actorId: "00000000-0000-4000-8000-000000000001",
  organizationId: "7237f9d4-3670-4a19-8946-a43c68fd3473",
  groupId: "00000000-0000-4000-8000-000000000002",
};
const operationId = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000099";
const sha = "A".repeat(64);
const filePath = `${scope.organizationId}/enrollment-orders/${scope.groupId}/${operationId}/${sha}.docx`;
function snapshot() {
  return {
    organization: { id: scope.organizationId, name: "Синтетическая организация ГОРЭЛТЕХ" },
    group: { id: scope.groupId, organization_id: scope.organizationId, course_id: null, group_number: "TEST-26",
      program_title: null, program_hours: null, start_date: "2026-09-01", end_date: "2026-09-30" },
    profiles: [{ user_id: other, full_name: "Тестовый Слушатель" }],
  };
}
function operation(status: "reserved" | "completed" = "completed") {
  return { ...scope, operationId, status, snapshot: snapshot(), snapshotHash: sha, documentNumber: "УЦ-1/2026",
    documentDate: "2026-09-04", signatory: { position: "Руководитель", name: "Тестовый Подписант" }, templateSha256: sha,
    filePath: status === "completed" ? filePath : null, docxSha256: status === "completed" ? sha : null };
}
function respond(extra: Record<string, unknown>) {
  mocks.invoke.mockResolvedValue({ data: { revision: ENROLLMENT_ORDER_REVISION, organizationId: scope.organizationId, groupId: scope.groupId, ...extra }, error: null });
}
const confirmation = { documentDate: "2026-09-04", signatory: { position: "Руководитель", name: "Тестовый Подписант" }, expectedSnapshotHash: sha };

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.stubEnv("VITE_SUPABASE_URL", "https://atxwvjxbqjgkbjlhsdch.supabase.co"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("enrollment order client: checked receipts, no implicit retry", () => {
  it("uses exact documentDate confirmation and no actor supplied by the browser", async () => {
    respond({ operation: operation() });
    await finalizeEnrollmentOrder(scope, operationId, confirmation);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("issue-group-enrollment-order", {
      retry: false, body: { action: "finalize", organizationId: scope.organizationId, groupId: scope.groupId, operationId, ...confirmation, confirmed: true },
    });
  });
  it("surfaces an uncertain mutation only once, without automatic reserve retries", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("network outcome unknown") });
    await expect(finalizeEnrollmentOrder(scope, operationId, confirmation)).rejects.toThrow("network outcome unknown");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("resumes only the original ID without sending mutable date/signer/snapshot", async () => {
    respond({ operation: operation() });
    await resumeEnrollmentOrder(scope, operationId);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("issue-group-enrollment-order", {
      retry: false, body: { action: "resume", organizationId: scope.organizationId, groupId: scope.groupId, operationId, confirmed: true },
    });
  });
  it("requires the server canonical summary, including title/hours supplied by course fallback", async () => {
    const documentSummary = { groupNumber: "TEST-26", programTitle: "Программа из курса", programHours: "40", startDate: "01.09.2026", endDate: "30.09.2026" };
    respond({ snapshot: snapshot(), snapshotHash: sha, issues: [], canFinalize: true, documentSummary });
    const result = await previewEnrollmentOrder(scope);
    expect(result.snapshot.group.program_title).toBeNull();
    expect(result.documentSummary).toEqual(documentSummary);
    respond({ snapshot: snapshot(), snapshotHash: sha, issues: [], canFinalize: true });
    await expect(previewEnrollmentOrder(scope)).rejects.toThrow();
  });
  it("rejects stale server revision and outer group mismatch", async () => {
    respond({ revision: "older-server", operation: operation() });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow();
    respond({ groupId: other, operation: operation() });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("другой группе");
  });
  it.each(["actorId", "groupId", "organizationId", "operationId"] as const)("rejects mismatched receipt %s", async field => {
    respond({ operation: { ...operation(), [field]: other } });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("Принадлежность");
  });
  it("rejects a foreign frozen roster even when the outer receipt scope matches", async () => {
    const receipt = operation(); receipt.snapshot.group.organization_id = other;
    respond({ operation: receipt });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("Принадлежность");
  });
  it("accepts the common completed archive created by another authorized organization staff member", async () => {
    respond({ operations: [{ ...operation(), actorId: other }] });
    expect((await listEnrollmentOrders(scope))[0].actorId).toBe(other);
  });
  it("rejects reserved entries in the completed archive", async () => {
    respond({ operations: [operation("reserved")] });
    await expect(listEnrollmentOrders(scope)).rejects.toThrow("незавершённая");
  });
  it("rejects missing/wrong final files and reserved receipts with an unconfirmed file", async () => {
    respond({ operation: { ...operation(), filePath: null } });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("Файл");
    respond({ operation: { ...operation(), filePath: `${other}/foreign.docx` } });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("Путь");
    respond({ operation: { ...operation("reserved"), filePath } });
    await expect(readEnrollmentOrder(scope, operationId)).rejects.toThrow("Незавершённый");
  });
  it("null status never acknowledges, removes, or recreates an intent", async () => {
    localStorage.setItem(enrollmentOrderStorageKey(scope), operationId);
    respond({ operation: null });
    expect(await readEnrollmentOrder(scope, operationId)).toBeNull();
    expect(readPendingEnrollmentOrder(scope)).toBe(operationId);
    expect(() => beginEnrollmentOrder(scope)).toThrow("предыдущую");
  });
});

describe("UUID-only persistence and proxied download", () => {
  it("persists only the UUID before the first request and does not store learner/signer details", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    expect(beginEnrollmentOrder(scope)).toBe(operationId);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(enrollmentOrderStorageKey(scope))).toBe(operationId);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not erase a newer index when acknowledging a previous operation", () => {
    const key = enrollmentOrderStorageKey(scope);
    localStorage.setItem(key, other);
    acknowledgeEnrollmentOrder(scope, operationId);
    expect(readPendingEnrollmentOrder(scope)).toBe(other);
    expect(localStorage.getItem(key)).toBe(other);
    localStorage.setItem(key, operationId);
    expect(readPendingEnrollmentOrder(scope)).toBeNull();
  });
  it("separates storage by actor, organization, and group", () => {
    const keys = [scope, { ...scope, actorId: other }, { ...scope, organizationId: other }, { ...scope, groupId: other }].map(enrollmentOrderStorageKey);
    expect(new Set(keys).size).toBe(4);
    localStorage.setItem(keys[0], operationId);
    expect(readPendingEnrollmentOrder({ ...scope, actorId: other })).toBeNull();
  });
  it("fails closed on malformed or unavailable operation storage", () => {
    localStorage.setItem(enrollmentOrderStorageKey(scope), "not-a-uuid");
    expect(() => beginEnrollmentOrder(scope)).toThrow();
    localStorage.clear();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => beginEnrollmentOrder(scope)).toThrow("quota");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("passes a validated Supabase signed URL through the existing Nginx asset proxy", async () => {
    const url = `https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/sign/goreltech-issued-documents/${filePath}?token=synthetic`;
    respond({ operationId, url });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await downloadEnrollmentOrder(scope, operationId);
    expect(mocks.proxy).toHaveBeenCalledWith(url);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
  });
  it.each([
    `https://example.invalid/storage/v1/object/sign/goreltech-issued-documents/${filePath}`,
    `https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/sign/goreltech-issued-documents/${filePath}/another.docx`,
    `https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/sign/goreltech-issued-documents/${scope.organizationId}/enrollment-orders/${scope.groupId}/${other}/${sha}.docx`,
    `http://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/sign/goreltech-issued-documents/${filePath}`,
  ])("rejects untrusted or out-of-scope download URL %s", async url => {
    respond({ operationId, url });
    await expect(downloadEnrollmentOrder(scope, operationId)).rejects.toThrow("Ссылка");
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
  it("rejects a download response for another operation", async () => {
    respond({ operationId: other, url: "https://example.invalid" });
    await expect(downloadEnrollmentOrder(scope, operationId)).rejects.toThrow("другому приказу");
  });
});
