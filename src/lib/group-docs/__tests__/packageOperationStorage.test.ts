import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAcknowledgedPackageOperation, packageOperationAcknowledgmentKey, packageOperationStorageKey, persistPackageOperation, readStoredPackageOperation,
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
