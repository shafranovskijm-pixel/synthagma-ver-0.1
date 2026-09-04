import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAcknowledgedPackageOperation, packageOperationAcknowledgmentKey, packageOperationStorageKey, persistPackageOperation, readPackageOperationContractIds, readPackageOperationFillMode, readStoredPackageOperation,
} from "../packageOperationStorage";

const scope = { organizationId: "organization-a", groupId: "group-a" };
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
describe("durable package operation UUID", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it("writes only the raw UUID and a fresh module recovers it after reload", async () => {
    persistPackageOperation(scope, id);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBe(id);
    vi.resetModules();
    const freshModule = await import("../packageOperationStorage");
    expect(freshModule.readStoredPackageOperation(scope)).toBe(id);
    freshModule.persistPackageOperation(scope, id);
    expect(localStorage.length).toBe(1);
    expect(freshModule.clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    expect(freshModule.readStoredPackageOperation(scope)).toBeNull();
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBe(id);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, id))).toBe(id);
    expect(localStorage.length).toBe(2);
  });

  it("keeps org/group scopes separate and never replaces a pending intent", () => {
    persistPackageOperation(scope, id);
    expect(() => persistPackageOperation(scope, otherId)).toThrow("другая незавершённая операция");
    persistPackageOperation({ ...scope, groupId: "group-b" }, otherId);
    persistPackageOperation({ ...scope, organizationId: "organization-b" }, otherId);
    expect(readStoredPackageOperation(scope)).toBe(id);
    expect(localStorage.length).toBe(3);
  });

  it("does not clear another pending operation on an old acknowledgment", () => {
    persistPackageOperation(scope, otherId);
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(false);
    expect(readStoredPackageOperation(scope)).toBe(otherId);
  });

  it("rejects a corrupt stored value without replacing or deleting it", () => {
    localStorage.setItem(packageOperationStorageKey(scope), "broken-value");
    expect(() => readStoredPackageOperation(scope)).toThrow("повреждён");
    expect(() => persistPackageOperation(scope, id)).toThrow("повреждён");
    expect(() => clearAcknowledgedPackageOperation(scope, id)).toThrow("повреждён");
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBe("broken-value");
  });

  it("fails closed on unavailable storage reads", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(() => readStoredPackageOperation(scope)).toThrow("Новое сохранение отключено");
    expect(() => persistPackageOperation(scope, id)).toThrow("Новое сохранение отключено");
  });

  it("does not pretend a failed write/readback persisted an operation", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    expect(() => persistPackageOperation(scope, id)).toThrow("Запрос сохранения не отправлен");
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBeNull();
  });

  it("retains an operation when the exact ACK write cannot be confirmed", () => {
    persistPackageOperation(scope, id);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);
    expect(() => clearAcknowledgedPackageOperation(scope, id)).toThrow("сохранение подтверждения операции");
    expect(readStoredPackageOperation(scope)).toBe(id);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, id))).toBeNull();
  });

  it("never removes B when another tab replaces index A between reading A and writing ACK A", async () => {
    persistPackageOperation(scope, id);
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    let injected = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      const value = originalGet.call(this, key);
      if (!injected && key === packageOperationStorageKey(scope) && value === id) {
        injected = true;
        originalSet.call(this, key, otherId);
      }
      return value;
    });
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(false);
    expect(injected).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBe(otherId);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, id))).toBe(id);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, otherId))).toBeNull();
    vi.restoreAllMocks();
    vi.resetModules();
    const reloaded = await import("../packageOperationStorage");
    expect(reloaded.readStoredPackageOperation(scope)).toBe(otherId);
  });

  it("allows a new UUID only after the exact indexed UUID is acknowledged", () => {
    persistPackageOperation(scope, id);
    expect(() => persistPackageOperation(scope, otherId)).toThrow("другая незавершённая операция");
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    persistPackageOperation(scope, otherId);
    expect(readStoredPackageOperation(scope)).toBe(otherId);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, id))).toBe(id);
  });

  it.each(["broken-ack", otherId, ""])("fails closed for a mismatched or corrupt ACK: %s", value => {
    persistPackageOperation(scope, id);
    localStorage.setItem(packageOperationAcknowledgmentKey(scope, id), value);
    expect(() => readStoredPackageOperation(scope)).toThrow("подтверждение операции повреждено");
    expect(() => persistPackageOperation(scope, otherId)).toThrow("подтверждение операции повреждено");
    expect(() => clearAcknowledgedPackageOperation(scope, id)).toThrow("подтверждение операции повреждено");
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, id))).toBe(value);
    expect(localStorage.getItem(packageOperationStorageKey(scope))).toBe(id);
  });

  it("an idempotent acknowledgment never rewrites its immutable marker", () => {
    persistPackageOperation(scope, id);
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("immutable package operation contract selection", () => {
  const contractA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const contractB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const key = (operationId = id, operationScope = scope) => `${packageOperationStorageKey(operationScope)}:contracts:${operationId}`;
  const metadata = (contractIds: string[] = [contractA]) => ({
    version: 1, organizationId: scope.organizationId, groupId: scope.groupId, operationId: id, contractIds,
  });

  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it("persists scoped UUID-only canonical metadata and confirms it before publishing the shared index", async () => {
    const originalSet = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      if (storageKey === packageOperationStorageKey(scope)) {
        expect(readPackageOperationContractIds(scope, id)).toEqual([contractA, contractB]);
      }
      originalSet.call(this, storageKey, value);
    });
    persistPackageOperation(scope, id, [contractB.toUpperCase(), contractA, contractB]);
    expect(write.mock.calls.map(([storageKey]) => storageKey)).toEqual([key(), packageOperationStorageKey(scope)]);
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual(metadata([contractA, contractB]));
    expect(readStoredPackageOperation(scope)).toBe(id);
    vi.resetModules();
    const reloaded = await import("../packageOperationStorage");
    expect(reloaded.readPackageOperationContractIds(scope, id)).toEqual([contractA, contractB]);
  });

  it("distinguishes legacy or missing metadata from an explicitly empty selection", () => {
    expect(readPackageOperationContractIds(scope, id)).toBeNull();
    persistPackageOperation(scope, id);
    expect(readPackageOperationContractIds(scope, id)).toBeNull();
    expect(localStorage.length).toBe(1);

    const emptyScope = { ...scope, groupId: "empty-group" };
    persistPackageOperation(emptyScope, otherId, []);
    expect(readPackageOperationContractIds(emptyScope, otherId)).toEqual([]);
    expect(readPackageOperationContractIds(emptyScope, id)).toBeNull();
    expect(localStorage.getItem(key(otherId, emptyScope))).not.toBeNull();
    expect(readStoredPackageOperation(emptyScope)).toBe(otherId);
  });

  it("accepts the same set reordered or repeated without rewriting immutable metadata", () => {
    persistPackageOperation(scope, id, [contractA, contractB]);
    const original = localStorage.getItem(key());
    const write = vi.spyOn(Storage.prototype, "setItem");
    persistPackageOperation(scope, id, [contractB.toUpperCase(), contractA, contractA]);
    expect(write.mock.calls.filter(([storageKey]) => storageKey === key())).toEqual([]);
    expect(localStorage.getItem(key())).toBe(original);
    // A caller cannot mutate the persisted selection through the returned array.
    readPackageOperationContractIds(scope, id)!.pop();
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA, contractB]);
  });

  it.each([[[contractB]], [[]], [[contractA, contractB]]])("refuses changing the selection for the same operation to %j", replacement => {
    persistPackageOperation(scope, id, [contractA]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => persistPackageOperation(scope, id, replacement)).toThrow("не может быть изменён");
    expect(write).not.toHaveBeenCalled();
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA]);
    expect(readStoredPackageOperation(scope)).toBe(id);
  });

  it("does not change explicit empty metadata through a legacy call or after acknowledgment", () => {
    persistPackageOperation(scope, id, []);
    persistPackageOperation(scope, id);
    expect(readPackageOperationContractIds(scope, id)).toEqual([]);
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    expect(() => persistPackageOperation(scope, id, [contractA])).toThrow("не может быть изменён");
    expect(readPackageOperationContractIds(scope, id)).toEqual([]);
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it("keeps metadata separate for every operation, group and organization", () => {
    persistPackageOperation(scope, id, [contractA]);
    expect(readPackageOperationContractIds(scope, otherId)).toBeNull();
    expect(readPackageOperationContractIds({ ...scope, groupId: "other-group" }, id)).toBeNull();
    expect(readPackageOperationContractIds({ ...scope, organizationId: "other-organization" }, id)).toBeNull();
    persistPackageOperation({ ...scope, groupId: "other-group" }, id, [contractB]);
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA]);
    expect(readPackageOperationContractIds({ ...scope, groupId: "other-group" }, id)).toEqual([contractB]);
  });

  it.each([
    ["not an array", contractA], ["null", null], ["invalid UUID", ["not-a-uuid"]],
    ["non-string ID", [contractA, 123]], ["whitespace", [` ${contractA}`]],
  ])("rejects invalid contract input before writing anything: %s", (_label, invalid) => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => persistPackageOperation(scope, id, invalid as readonly string[])).toThrow("только UUID");
    expect(write).not.toHaveBeenCalled();
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it("rejects an invalid operation ID for metadata reads and writes", () => {
    expect(() => readPackageOperationContractIds(scope, "broken")).toThrow("Некорректный идентификатор");
    expect(() => persistPackageOperation(scope, "broken", [])).toThrow("Некорректный идентификатор");
    expect(localStorage.length).toBe(0);
  });

  it.each([
    ["invalid JSON", "{"], ["null", "null"], ["array", "[]"],
    ["wrong organization", JSON.stringify({ ...metadata(), organizationId: "other-organization" })],
    ["wrong group", JSON.stringify({ ...metadata(), groupId: "other-group" })],
    ["wrong operation", JSON.stringify({ ...metadata(), operationId: otherId })],
    ["wrong version", JSON.stringify({ ...metadata(), version: 3 })],
    ["missing selection", JSON.stringify({ ...metadata(), contractIds: undefined })],
    ["null selection", JSON.stringify({ ...metadata(), contractIds: null })],
    ["invalid contract UUID", JSON.stringify(metadata(["broken"]))],
    ["duplicate IDs", JSON.stringify(metadata([contractA, contractA]))],
    ["unsorted IDs", JSON.stringify(metadata([contractB, contractA]))],
    ["noncanonical case", JSON.stringify(metadata([contractA.toUpperCase()]))],
    ["unexpected payload", JSON.stringify({ ...metadata(), documentHtml: "must not be stored" })],
  ])("fails closed on corrupt scoped metadata without overwriting it: %s", (_label, stored) => {
    localStorage.setItem(key(), stored);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => readPackageOperationContractIds(scope, id)).toThrow("повреждён");
    expect(() => persistPackageOperation(scope, id, [contractA])).toThrow("повреждён");
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key())).toBe(stored);
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it.each(["throw", "ignore", "wrong-scope-readback", "wrong-contracts-readback", "readback-error"])("never publishes a request-ready index after metadata storage failure: %s", failure => {
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    let attempted = false;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      if (storageKey === key()) {
        attempted = true;
        if (failure === "throw") throw new Error("QuotaExceededError");
        if (failure === "ignore") return;
        if (failure === "wrong-scope-readback") {
          value = JSON.stringify({ ...metadata(), groupId: "another-group" });
        }
        if (failure === "wrong-contracts-readback") value = JSON.stringify(metadata([contractB]));
      }
      originalSet.call(this, storageKey, value);
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, storageKey: string) {
      if (failure === "readback-error" && attempted && storageKey === key()) throw new Error("SecurityError");
      return originalGet.call(this, storageKey);
    });
    expect(() => persistPackageOperation(scope, id, [contractA])).toThrow("Запрос сохранения не отправлен");
    expect(write.mock.calls.some(([storageKey]) => storageKey === packageOperationStorageKey(scope))).toBe(false);
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it("does not treat unavailable metadata reads as a legacy missing selection", () => {
    const originalGet = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, storageKey: string) {
      if (storageKey === key()) throw new Error("SecurityError");
      return originalGet.call(this, storageKey);
    });
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => readPackageOperationContractIds(scope, id)).toThrow("Не удалось прочитать список договоров");
    expect(() => persistPackageOperation(scope, id, [])).toThrow("Не удалось прочитать список договоров");
    expect(write).not.toHaveBeenCalled();
  });

  it("retains immutable metadata after an index write failure and permits retry only with the original set", () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      if (storageKey === packageOperationStorageKey(scope)) throw new Error("QuotaExceededError");
      originalSet.call(this, storageKey, value);
    });
    expect(() => persistPackageOperation(scope, id, [contractA])).toThrow("Запрос сохранения не отправлен");
    expect(readStoredPackageOperation(scope)).toBeNull();
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA]);
    vi.restoreAllMocks();
    expect(() => persistPackageOperation(scope, id, [contractB])).toThrow("не может быть изменён");
    persistPackageOperation(scope, id, [contractA]);
    expect(readStoredPackageOperation(scope)).toBe(id);
  });

  it("a late ACK for A preserves B's index and both immutable contract selections", () => {
    persistPackageOperation(scope, id, [contractA]);
    clearAcknowledgedPackageOperation(scope, id);
    persistPackageOperation(scope, otherId, [contractB]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(readStoredPackageOperation(scope)).toBe(otherId);
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA]);
    expect(readPackageOperationContractIds(scope, otherId)).toEqual([contractB]);
    expect(localStorage.getItem(packageOperationAcknowledgmentKey(scope, otherId))).toBeNull();
  });

  it("does not replace another tab's pending index that appears while metadata is being persisted", () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      originalSet.call(this, storageKey, value);
      if (storageKey === key()) {
        originalSet.call(this, key(otherId), JSON.stringify({ ...metadata([contractB]), operationId: otherId }));
        originalSet.call(this, packageOperationStorageKey(scope), otherId);
      }
    });
    expect(() => persistPackageOperation(scope, id, [contractA])).toThrow("другая незавершённая операция");
    expect(readStoredPackageOperation(scope)).toBe(otherId);
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(false);
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractA]);
    expect(readPackageOperationContractIds(scope, otherId)).toEqual([contractB]);
  });
});

describe("immutable package operation fill mode", () => {
  const contractId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const key = `${packageOperationStorageKey(scope)}:contracts:${id}`;
  const metadata = (fillMode: unknown = "data") => ({
    version: 2, organizationId: scope.organizationId, groupId: scope.groupId, operationId: id,
    contractIds: [contractId], fillMode,
  });
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it.each(["data", "blank"] as const)("persists and reloads exact %s mode before the shared operation index", async fillMode => {
    const originalSet = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      if (storageKey === packageOperationStorageKey(scope)) expect(readPackageOperationFillMode(scope, id)).toBe(fillMode);
      originalSet.call(this, storageKey, value);
    });
    persistPackageOperation(scope, id, [contractId], fillMode);
    expect(write.mock.calls.map(([storageKey]) => storageKey)).toEqual([key, packageOperationStorageKey(scope)]);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(metadata(fillMode));
    vi.resetModules();
    const reloaded = await import("../packageOperationStorage");
    expect(reloaded.readPackageOperationFillMode(scope, id)).toBe(fillMode);
    expect(reloaded.readPackageOperationContractIds(scope, id)).toEqual([contractId]);
    expect(reloaded.readStoredPackageOperation(scope)).toBe(id);
    write.mockClear();
    reloaded.persistPackageOperation(scope, id, [contractId.toUpperCase(), contractId], fillMode);
    expect(write.mock.calls.some(([storageKey]) => storageKey === key)).toBe(false);
  });

  it.each(["data", "blank"] as const)("never changes saved %s mode, including through legacy calls or after ACK", fillMode => {
    persistPackageOperation(scope, id, [], fillMode);
    persistPackageOperation(scope, id);
    persistPackageOperation(scope, id, []);
    expect(readPackageOperationFillMode(scope, id)).toBe(fillMode);
    const opposite = fillMode === "data" ? "blank" : "data";
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => persistPackageOperation(scope, id, [], opposite)).toThrow("Режим заполнения уже сохранён");
    expect(write).not.toHaveBeenCalled();
    clearAcknowledgedPackageOperation(scope, id);
    expect(() => persistPackageOperation(scope, id, [], opposite)).toThrow("Режим заполнения уже сохранён");
    expect(readPackageOperationFillMode(scope, id)).toBe(fillMode);
    expect(readPackageOperationContractIds(scope, id)).toEqual([]);
  });

  it.each(["raw UUID", "v1 IDs"])("returns null for %s metadata and refuses silently retrofitting mode", legacy => {
    expect(readPackageOperationFillMode(scope, id)).toBeNull();
    if (legacy === "raw UUID") persistPackageOperation(scope, id);
    else persistPackageOperation(scope, id, [contractId]);
    const original = localStorage.getItem(key);
    expect(readPackageOperationFillMode(scope, id)).toBeNull();
    expect(readPackageOperationContractIds(scope, id)).toEqual(legacy === "raw UUID" ? null : [contractId]);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => persistPackageOperation(scope, id, [contractId], "data")).toThrow("Режим старой операции не сохранён");
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(original);
    expect(readStoredPackageOperation(scope)).toBe(id);
    // Read-only reconciliation can still acknowledge the exact legacy intent.
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(true);
    expect(readStoredPackageOperation(scope)).toBeNull();
    expect(readPackageOperationFillMode(scope, id)).toBeNull();
  });

  it("requires explicit IDs when supplying mode and rejects invalid mode before any write", () => {
    expect(() => persistPackageOperation(scope, id, undefined, "data")).toThrow("явный список UUID");
    expect(() => persistPackageOperation(scope, id, [], "unknown" as "data")).toThrow("Некорректный режим");
    expect(() => readPackageOperationFillMode(scope, "broken")).toThrow("Некорректный идентификатор");
    expect(localStorage.length).toBe(0);
  });

  it.each([
    ["invalid mode", metadata("other")], ["null mode", metadata(null)], ["non-string mode", metadata(1)],
    ["missing v2 mode", { ...metadata(), fillMode: undefined }],
    ["mode falsely added to v1", { ...metadata(), version: 1 }],
    ["wrong group", { ...metadata(), groupId: "other" }],
    ["wrong organization", { ...metadata(), organizationId: "other" }],
    ["wrong operation", { ...metadata(), operationId: otherId }],
  ])("rejects corrupt v2 metadata for both readers and persistence: %s", (_label, value) => {
    const original = JSON.stringify(value);
    localStorage.setItem(key, original);
    const write = vi.spyOn(Storage.prototype, "setItem");
    expect(() => readPackageOperationFillMode(scope, id)).toThrow("повреждён");
    expect(() => readPackageOperationContractIds(scope, id)).toThrow("повреждён");
    expect(() => persistPackageOperation(scope, id, [contractId], "data")).toThrow("повреждён");
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(original);
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it.each(["throw", "ignore", "changed-mode", "removed-mode", "downgraded-v1"])("does not publish an index when v2 metadata write/readback fails: %s", failure => {
    const originalSet = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, storageKey: string, value: string) {
      if (storageKey === key) {
        if (failure === "throw") throw new Error("QuotaExceededError");
        if (failure === "ignore") return;
        if (failure === "changed-mode") value = JSON.stringify(metadata("blank"));
        if (failure === "removed-mode") value = JSON.stringify({ ...metadata(), fillMode: undefined });
        if (failure === "downgraded-v1") value = JSON.stringify({ ...metadata(), version: 1, fillMode: undefined });
      }
      originalSet.call(this, storageKey, value);
    });
    expect(() => persistPackageOperation(scope, id, [contractId], "data")).toThrow("Запрос сохранения не отправлен");
    expect(write.mock.calls.some(([storageKey]) => storageKey === packageOperationStorageKey(scope))).toBe(false);
    expect(readStoredPackageOperation(scope)).toBeNull();
  });

  it("reports unavailable mode reads as failure, never legacy null", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(() => readPackageOperationFillMode(scope, id)).toThrow("Не удалось прочитать");
  });

  it("late ACK cannot replace another operation's persisted mode or contract IDs", () => {
    persistPackageOperation(scope, id, [contractId], "data");
    clearAcknowledgedPackageOperation(scope, id);
    persistPackageOperation(scope, otherId, [], "blank");
    expect(clearAcknowledgedPackageOperation(scope, id)).toBe(false);
    expect(readStoredPackageOperation(scope)).toBe(otherId);
    expect(readPackageOperationFillMode(scope, id)).toBe("data");
    expect(readPackageOperationFillMode(scope, otherId)).toBe("blank");
    expect(readPackageOperationContractIds(scope, id)).toEqual([contractId]);
    expect(readPackageOperationContractIds(scope, otherId)).toEqual([]);
  });
});
