import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => state.from(...args) } }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: state.success, warning: state.warning } }));
vi.mock("@/hooks/useWordDocumentGenerator", () => ({ useWordDocumentGenerator: () => ({ generateDocument: vi.fn(), isGenerating: false }) }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: vi.fn() }));

import { useLaborSafetyManager, type LaborSafetyRecord } from "@/hooks/useLaborSafetyManager";

const group = { id: "group-1", organization_id: "org-1", name: "Группа А", created_at: "2026-09-04T00:00:00Z" };
const record: LaborSafetyRecord = {
  id: "record-1", group_id: "group-1", full_name: "Тестовая Елизавета Олеговна",
  snils: "112-233-445 95", position: "Инженер", inn: "7707083893", organization_name: "ООО Тест",
  protocol_number: "ОТ-1", program_name: "Программа А", exam_date: "2026-09-04", is_passed: true,
};

async function loadedManager(records: LaborSafetyRecord[], name = group.name) {
  state.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query,
      order: async () => ({ data: table === "labor_safety_groups" ? [group] : records, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return query;
  });
  const hook = renderHook(() => useLaborSafetyManager({ organizationId: "org-1" }));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  act(() => hook.result.current.setSelectedGroup({ ...group, name }));
  await waitFor(() => expect(hook.result.current.records).toHaveLength(records.length));
  return hook.result;
}

describe("organization labor-safety XML export", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each([
    ["record", "\u0000", "Запись 2, поле «Номер протокола»"],
    ["group", "\udfff", "Поле «Название группы»"],
  ])("rejects invalid %s data without a Blob, partial download or success", async (target, bad, message) => {
    const result = await loadedManager([
      record,
      { ...record, id: "record-2", protocol_number: target === "record" ? `private${bad}` : "ОТ-2" },
    ], target === "group" ? `private${bad}` : group.name);
    const blob = vi.spyOn(globalThis, "Blob");
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    act(() => result.current.exportSelectedToXML());
    expect(state.error).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(state.error.mock.calls[0][0]).not.toContain("private");
    expect(blob).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.warning).not.toHaveBeenCalled();
    expect(result.current.records).toHaveLength(2);
  });

  it("still downloads selected valid Unicode records with escaped data", async () => {
    const result = await loadedManager([record, { ...record, id: "record-2", full_name: "Елизавета 😀 & <Тест>" }]);
    const blob = vi.spyOn(globalThis, "Blob");
    const createObjectURL = vi.fn(() => "blob:xml-test");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    act(() => result.current.setSelectedRecordIds(new Set(["record-2"])));
    act(() => result.current.exportSelectedToXML());
    expect(blob).toHaveBeenCalledTimes(1);
    const xml = blob.mock.calls[0][0]?.[0] as string;
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelectorAll("Record")).toHaveLength(1);
    expect(parsed.querySelector("FullName")?.textContent).toBe("Елизавета 😀 & <Тест>");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(state.error).not.toHaveBeenCalled();
    expect(state.success).toHaveBeenCalledTimes(1);
  });
});
