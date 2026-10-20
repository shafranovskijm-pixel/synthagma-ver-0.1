import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: "actor-a" as string | null, role: "organization", loading: false,
  permissionOrg: "org-a" as string | null, permissionLoading: false, permissionError: null as string | null,
  journalRead: true, missingProvider: false, globalAdmin: false,
  getXLSX: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.actor ? { id: mocks.actor } : null, userRole: mocks.role, loading: mocks.loading }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => mocks.missingProvider
  ? { loading: false, error: null, organizationId: null, isOrgOwner: false, orgPermissions: new Set(), can: () => true }
  : { loading: mocks.permissionLoading, error: mocks.permissionError, organizationId: mocks.permissionOrg,
    isOrgOwner: mocks.globalAdmin, orgPermissions: new Set(mocks.journalRead ? ["journals.read"] : []), can: (permission: string) => permission === "journals.read" && mocks.journalRead } }));
vi.mock("@/utils/xlsxHelper", () => ({ getXLSX: mocks.getXLSX }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { useCopiesDuplicatesJournal, type CopyDuplicateRecord } from "../useCopiesDuplicatesJournal";

const key = (org: string) => `copies_duplicates_${org}`;
const year = new Date().getFullYear();
function record(id = "row-a", name = "Synthetic A"): CopyDuplicateRecord {
  return { id, reg_number: `КОП-${year}/007`, recipient_name: name, original_document_type: "certificate",
    original_document_number: "original-17", original_issue_date: `${year}-01-02T12:00:00.000Z`,
    copy_type: "copy", issue_date: `${year}-02-03T12:00:00.000Z`, issue_reason: "lost", notes: null };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function spreadsheet() {
  return { utils: { json_to_sheet: vi.fn(() => ({})), book_new: vi.fn(() => ({})), book_append_sheet: vi.fn() }, writeFile: vi.fn() };
}
function mount(org = "org-a", renders?: Array<{ org: string; names: string[]; editing: string | null }>) {
  return renderHook(({ organizationId }) => {
    const journal = useCopiesDuplicatesJournal(organizationId);
    renders?.push({ org: organizationId, names: journal.records.map(r => r.recipient_name), editing: journal.editingRecord?.id ?? null });
    return journal;
  }, { initialProps: { organizationId: org } });
}
type Journal = ReturnType<typeof useCopiesDuplicatesJournal>;
function move(hook: { rerender: (props: { organizationId: string }) => void }, organizationId: string) {
  mocks.permissionOrg = organizationId;
  hook.rerender({ organizationId });
}
function fill(journal: Journal, name = "New synthetic row") {
  journal.setFormData(previous => ({ ...previous, recipient_name: name, reg_number: "manual-number", original_document_number: "original-new" }));
}

beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
  mocks.actor = "actor-a"; mocks.role = "organization"; mocks.loading = false;
  mocks.permissionOrg = "org-a"; mocks.permissionLoading = false; mocks.permissionError = null;
  mocks.journalRead = true; mocks.missingProvider = false; mocks.globalAdmin = false;
  mocks.getXLSX.mockResolvedValue(spreadsheet());
});
afterEach(cleanup);

describe("copy journal isolates local records and callbacks", () => {
  it("does not read or mutate local records until an actor is confirmed, then rejects the pre-auth callback", () => {
    localStorage.setItem(key("org-a"), JSON.stringify([record()])); mocks.actor = null;
    const read = vi.spyOn(Storage.prototype, "getItem"), write = vi.spyOn(Storage.prototype, "setItem");
    const hook = mount(), beforeAuth = hook.result.current;
    expect(read).not.toHaveBeenCalled(); expect(hook.result.current.loading).toBe(true); expect(hook.result.current.records).toEqual([]);
    mocks.actor = "actor-a"; hook.rerender({ organizationId: "org-a" });
    expect(hook.result.current.records).toHaveLength(1); expect(read).toHaveBeenCalledWith(key("org-a"));
    act(() => { fill(beforeAuth); beforeAuth.handleSave(); });
    expect(write).not.toHaveBeenCalled(); expect(hook.result.current.formData.recipient_name).toBe("");
  });

  it("waits for both B's confirmed permissions and B's organization prop before reading after an actor change", async () => {
    const a = JSON.stringify([record()]), b = JSON.stringify([record("row-b", "Synthetic B")]);
    localStorage.setItem(key("org-a"), a); localStorage.setItem(key("org-b"), b);
    const hook = mount(); act(() => { fill(hook.result.current); hook.result.current.setDeletingRecord(hook.result.current.records[0]); });
    const oldA = hook.result.current;
    const read = vi.spyOn(Storage.prototype, "getItem"), write = vi.spyOn(Storage.prototype, "setItem");
    mocks.actor = "actor-b"; mocks.permissionLoading = true;
    hook.rerender({ organizationId: "org-a" });
    expect(hook.result.current.loading).toBe(true); expect(hook.result.current.records).toEqual([]);
    mocks.permissionLoading = false; mocks.permissionOrg = "org-b";
    hook.rerender({ organizationId: "org-a" });
    expect(hook.result.current.loading).toBe(true); expect(hook.result.current.formData.recipient_name).toBe("");
    expect(read).not.toHaveBeenCalled();
    const unresolved = hook.result.current;
    hook.rerender({ organizationId: "org-b" });
    expect(hook.result.current.records.map(r => r.recipient_name)).toEqual(["Synthetic B"]);
    expect(read).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith(key("org-b"));
    act(() => { oldA.handleSave(); oldA.handleDelete(); fill(unresolved); unresolved.handleSave(); });
    await act(async () => { await oldA.exportToExcel(); await unresolved.exportToExcel(); });
    expect(write).not.toHaveBeenCalled(); expect(mocks.getXLSX).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe(a); expect(localStorage.getItem(key("org-b"))).toBe(b);
  });

  it.each(["missing-provider", "loading", "error", "mismatch", "revoked"])("fails closed on %s permission confirmation, including captured callbacks", async denial => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const hook = mount(); act(() => { fill(hook.result.current); hook.result.current.setDeletingRecord(hook.result.current.records[0]); });
    const old = hook.result.current;
    if (denial === "missing-provider") mocks.missingProvider = true;
    if (denial === "loading") mocks.permissionLoading = true;
    if (denial === "error") mocks.permissionError = "Permission lookup failed";
    if (denial === "mismatch") mocks.permissionOrg = "org-b";
    if (denial === "revoked") mocks.journalRead = false;
    const read = vi.spyOn(Storage.prototype, "getItem"), write = vi.spyOn(Storage.prototype, "setItem");
    hook.rerender({ organizationId: "org-a" });
    expect(hook.result.current.loading).toBe(true); expect(hook.result.current.records).toEqual([]);
    act(() => { old.handleSave(); old.handleDelete(); hook.result.current.handleSave(); });
    await act(async () => { await old.exportToExcel(); await hook.result.current.exportToExcel(); });
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(mocks.getXLSX).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe(raw);
  });

  it("rejects the actual permissive no-provider fallback before its first local read", () => {
    mocks.missingProvider = true; localStorage.setItem(key("org-a"), JSON.stringify([record()]));
    const read = vi.spyOn(Storage.prototype, "getItem"); const hook = mount();
    expect(hook.result.current.loading).toBe(true); expect(hook.result.current.records).toEqual([]); expect(read).not.toHaveBeenCalled();
  });

  it("retains the deliberate resolved global-admin view with null workspace and real read permissions", () => {
    mocks.role = "admin"; mocks.permissionOrg = null; mocks.globalAdmin = true;
    localStorage.setItem(key("org-a"), JSON.stringify([record()])); const hook = mount();
    expect(hook.result.current.loading).toBe(false); expect(hook.result.current.records.map(r => r.id)).toEqual(["row-a"]);
  });

  it("loads without rewriting bytes, then preserves own-org IDs/numbers and unknown legacy fields on edit/add", async () => {
    const original = { ...record(), retained_legacy_field: "unchanged" };
    const raw = JSON.stringify([original], null, 2);
    localStorage.setItem(key("org-a"), raw);
    localStorage.setItem(key("org-b"), "unreadable-foreign-source");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const hook = mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe(raw);
    act(() => hook.result.current.handleOpenEdit(hook.result.current.records[0]));
    act(() => hook.result.current.setFormData(previous => ({ ...previous, notes: "explicit edit" })));
    act(() => hook.result.current.handleSave());
    const edited = JSON.parse(localStorage.getItem(key("org-a"))!);
    expect(edited).toEqual([{ ...original, notes: "explicit edit" }]);
    act(() => hook.result.current.handleOpenAdd());
    act(() => fill(hook.result.current));
    act(() => hook.result.current.handleSave());
    const added = JSON.parse(localStorage.getItem(key("org-a"))!);
    expect(added).toHaveLength(2); expect(added[1]).toEqual(edited[0]);
    expect(added[0].id).not.toBe(original.id); expect(added[0].reg_number).toBe("manual-number");
    expect(localStorage.getItem(key("org-b"))).toBe("unreadable-foreign-source");
  });

  it("masks A on the first B render with a missing key and saves only the explicit new B row", async () => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const renders: Parameters<typeof mount>[1] = [];
    const hook = mount("org-a", renders);
    act(() => hook.result.current.handleOpenEdit(hook.result.current.records[0]));
    move(hook, "org-b");
    expect(renders.filter(x => x.org === "org-b").every(x => x.names.length === 0 && x.editing === null)).toBe(true);
    expect(hook.result.current.formData.recipient_name).toBe("");
    expect(hook.result.current.showAddDialog).toBe(false);
    act(() => fill(hook.result.current, "Synthetic B"));
    act(() => hook.result.current.handleSave());
    expect(JSON.parse(localStorage.getItem(key("org-b"))!).map((r: CopyDuplicateRecord) => r.recipient_name)).toEqual(["Synthetic B"]);
    expect(localStorage.getItem(key("org-a"))).toBe(raw);
  });

  it.each(["{broken", "null", "", "{}", '[{"id":"row-with-no-fields"}]', JSON.stringify([{ ...record(), issue_date: "not-a-date" }])])(
    "keeps an unreadable B source untouched and blocks every mutation/export (%s)", async bad => {
      const a = JSON.stringify([record()]); localStorage.setItem(key("org-a"), a); localStorage.setItem(key("org-b"), bad);
      const hook = mount();
      move(hook, "org-b");
      const write = vi.spyOn(Storage.prototype, "setItem"), remove = vi.spyOn(Storage.prototype, "removeItem");
      expect(hook.result.current.error).toContain("Исходные данные сохранены");
      expect(hook.result.current.records).toEqual([]);
      act(() => { fill(hook.result.current); hook.result.current.handleOpenAdd(); hook.result.current.setDeletingRecord(record()); });
      act(() => { hook.result.current.handleSave(); hook.result.current.handleDelete(); });
      await act(async () => { await hook.result.current.exportToExcel(); });
      expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(mocks.getXLSX).not.toHaveBeenCalled();
      expect(localStorage.getItem(key("org-b"))).toBe(bad); expect(localStorage.getItem(key("org-a"))).toBe(a);
    },
  );

  it("refuses captured save/delete/setter/export callbacks after A -> B -> A even when the key bytes match", async () => {
    const a = JSON.stringify([record()]); localStorage.setItem(key("org-a"), a);
    const hook = mount();
    act(() => { fill(hook.result.current); hook.result.current.setDeletingRecord(hook.result.current.records[0]); });
    const old = hook.result.current;
    move(hook, "org-b"); move(hook, "org-a");
    const write = vi.spyOn(Storage.prototype, "setItem"), remove = vi.spyOn(Storage.prototype, "removeItem");
    act(() => { old.handleSave(); old.handleDelete(); old.handleOpenEdit(old.records[0]); old.handleOpenAdd(); old.generateRegNumber(); fill(old, "stale form"); old.setDeletingRecord(old.records[0]); });
    await act(async () => { await old.exportToExcel(); });
    expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(mocks.getXLSX).not.toHaveBeenCalled();
    expect(hook.result.current.formData.recipient_name).toBe(""); expect(hook.result.current.deletingRecord).toBeNull();
    expect(hook.result.current.error).toBeNull(); expect(localStorage.getItem(key("org-a"))).toBe(a); expect(localStorage.getItem(key("org-b"))).toBeNull();
  });

  it.each(["actor", "role", "loading", "unmount"])("invalidates captured writes on %s transition", transition => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const hook = mount(); act(() => { fill(hook.result.current); hook.result.current.setDeletingRecord(hook.result.current.records[0]); });
    const old = hook.result.current;
    if (transition === "unmount") hook.unmount();
    else {
      if (transition === "actor") mocks.actor = "actor-b";
      if (transition === "role") mocks.role = "student";
      if (transition === "loading") mocks.loading = true;
      hook.rerender({ organizationId: "org-a" });
    }
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => { old.handleSave(); old.handleDelete(); });
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(key("org-a"))).toBe(raw);
  });

  it("does not overwrite a valid source changed after load", () => {
    localStorage.setItem(key("org-a"), JSON.stringify([record()]));
    const hook = mount(); act(() => fill(hook.result.current));
    const changed = JSON.stringify([record("another-row", "Another writer")]); localStorage.setItem(key("org-a"), changed);
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => hook.result.current.handleSave());
    expect(write).not.toHaveBeenCalled(); expect(hook.result.current.error).toContain("Журнал в браузере изменился");
    expect(localStorage.getItem(key("org-a"))).toBe(changed);
  });

  it("fails closed when storage cannot be read initially or immediately before a write", () => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const hook = mount(); act(() => fill(hook.result.current));
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => hook.result.current.handleSave());
    expect(write).not.toHaveBeenCalled(); expect(hook.result.current.error).toContain("Исходные данные сохранены");
    hook.unmount(); const second = mount(); expect(second.result.current.records).toEqual([]); expect(second.result.current.error).toBeTruthy();
    read.mockRestore(); expect(localStorage.getItem(key("org-a"))).toBe(raw);
  });

  it.each(["save", "delete"])("handles %s quota failure without losing the stored row or announcing success", action => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const hook = mount(); act(() => { fill(hook.result.current); hook.result.current.setDeletingRecord(hook.result.current.records[0]); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    act(() => action === "save" ? hook.result.current.handleSave() : hook.result.current.handleDelete());
    expect(localStorage.getItem(key("org-a"))).toBe(raw); expect(hook.result.current.error).toBeTruthy(); expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});

describe("lazy spreadsheet export lifetime", () => {
  it.each(["organization", "actor", "actor-aba", "organization-aba", "loading", "unmount", "permission-loading", "permission-error", "permission-mismatch", "permission-revoked", "permission-revoked-aba", "missing-provider"])("does not build/download the old rows after pending XLSX and %s change", async transition => {
    const raw = JSON.stringify([record()]); localStorage.setItem(key("org-a"), raw);
    const pending = deferred<ReturnType<typeof spreadsheet>>(); mocks.getXLSX.mockReturnValue(pending.promise);
    const hook = mount(); let exported!: Promise<void>;
    act(() => { exported = hook.result.current.exportToExcel(); });
    expect(mocks.getXLSX).toHaveBeenCalledOnce();
    if (transition === "unmount") hook.unmount();
    else if (transition.startsWith("organization")) {
      move(hook, "org-b");
      if (transition.endsWith("aba")) move(hook, "org-a");
    } else {
      if (transition === "loading") mocks.loading = true;
      else if (transition === "permission-loading") mocks.permissionLoading = true;
      else if (transition === "permission-error") mocks.permissionError = "lookup failed";
      else if (transition === "permission-mismatch") mocks.permissionOrg = "org-b";
      else if (transition.startsWith("permission-revoked")) mocks.journalRead = false;
      else if (transition === "missing-provider") mocks.missingProvider = true;
      else mocks.actor = "actor-b";
      hook.rerender({ organizationId: "org-a" });
      if (transition === "actor-aba") { mocks.actor = "actor-a"; hook.rerender({ organizationId: "org-a" }); }
      if (transition === "permission-revoked-aba") { mocks.journalRead = true; hook.rerender({ organizationId: "org-a" }); }
    }
    const xlsx = spreadsheet();
    await act(async () => { pending.resolve(xlsx); await exported; });
    expect(xlsx.utils.json_to_sheet).not.toHaveBeenCalled(); expect(xlsx.writeFile).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe(raw); expect(localStorage.getItem(key("org-b"))).toBeNull();
  });

  it("does not export a source that became malformed while the library was loading", async () => {
    localStorage.setItem(key("org-a"), JSON.stringify([record()]));
    const pending = deferred<ReturnType<typeof spreadsheet>>(); mocks.getXLSX.mockReturnValue(pending.promise);
    const hook = mount(); let exported!: Promise<void>;
    act(() => { exported = hook.result.current.exportToExcel(); });
    localStorage.setItem(key("org-a"), "{changed-broken"); const xlsx = spreadsheet();
    await act(async () => { pending.resolve(xlsx); await exported; });
    expect(xlsx.writeFile).not.toHaveBeenCalled(); expect(hook.result.current.error).toBeTruthy();
    expect(localStorage.getItem(key("org-a"))).toBe("{changed-broken");
  });

  it("retains the valid own-org export columns and filename without touching storage", async () => {
    const row = record(); const raw = JSON.stringify([row]); localStorage.setItem(key("org-a"), raw);
    const xlsx = spreadsheet(); mocks.getXLSX.mockResolvedValue(xlsx);
    const hook = mount(); const write = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { await hook.result.current.exportToExcel(); });
    expect(xlsx.utils.json_to_sheet).toHaveBeenCalledWith([expect.objectContaining({ "Рег. номер": row.reg_number, "ФИО получателя": row.recipient_name, "Номер оригинала": row.original_document_number })]);
    expect(xlsx.writeFile).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^Журнал_копий_дубликатов_\d{2}-\d{2}-\d{4}\.xlsx$/));
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(key("org-a"))).toBe(raw);
  });
});
