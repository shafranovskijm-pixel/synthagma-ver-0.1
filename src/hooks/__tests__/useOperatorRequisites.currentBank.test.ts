import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_OPERATOR_REQUISITES } from "@/constants/operatorDetails";

const { maybeSingle, upsert } = vi.hoisted(() => ({ maybeSingle: vi.fn(), upsert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), upsert }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
import { loadOperatorRequisites, saveOperatorRequisites, useOperatorRequisites } from "@/hooks/useOperatorRequisites";

describe("operator bank used by subscription invoices", () => {
  beforeEach(() => vi.clearAllMocks());
  const saved = (value: unknown) => maybeSingle.mockResolvedValue({ data: { setting_value: JSON.stringify(value) }, error: null });

  it("loads the complete saved current tuple", async () => {
    saved(DEFAULT_OPERATOR_REQUISITES);
    await expect(loadOperatorRequisites()).resolves.toEqual(DEFAULT_OPERATOR_REQUISITES);
  });

  it.each(["40914810200040551529", "40914 810 2 0000 3058331"])("rejects saved retired account %s without a successful fallback", async (bankAccount) => {
    saved({ ...DEFAULT_OPERATOR_REQUISITES, bankAccount });
    await expect(loadOperatorRequisites()).rejects.toThrow("Старый расчётный счёт 409");
  });

  it("rejects an incomplete saved bank rather than mixing it with defaults", async () => {
    saved({ ...DEFAULT_OPERATOR_REQUISITES, corrAccount: "" });
    await expect(loadOperatorRequisites()).rejects.toThrow("Банковские реквизиты оператора не заполнены");
  });

  it("rejects malformed saved JSON rather than treating it as a transport error", async () => {
    maybeSingle.mockResolvedValue({ data: { setting_value: "bad-json" }, error: null });
    await expect(loadOperatorRequisites()).rejects.toThrow("Не удалось прочитать сохранённые");
  });

  it("uses the user-confirmed default tuple when the database reports a transport error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(loadOperatorRequisites()).resolves.toEqual(DEFAULT_OPERATOR_REQUISITES);
  });

  it("uses the user-confirmed default tuple when transport throws", async () => {
    maybeSingle.mockRejectedValue(new Error("offline"));
    await expect(loadOperatorRequisites()).resolves.toEqual(DEFAULT_OPERATOR_REQUISITES);
  });

  it("uses the user-confirmed default tuple when no stored record exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(loadOperatorRequisites()).resolves.toEqual(DEFAULT_OPERATOR_REQUISITES);
  });

  it("does not save a retired operator account", async () => {
    await expect(saveOperatorRequisites({ ...DEFAULT_OPERATOR_REQUISITES, bankAccount: "40914810200040551529" })).rejects.toThrow("Старый расчётный счёт 409");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("preserves invalid saved fields for repair in the settings editor and finishes loading", async () => {
    saved({ ...DEFAULT_OPERATOR_REQUISITES, bankAccount: "40914810200040551529", address: "Сохранённый адрес оператора" });
    const { result } = renderHook(() => useOperatorRequisites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("Старый расчётный счёт 409");
    expect(result.current.requisites.bankAccount).toBe("40914810200040551529");
    expect(result.current.requisites.address).toBe("Сохранённый адрес оператора");
  });
});
