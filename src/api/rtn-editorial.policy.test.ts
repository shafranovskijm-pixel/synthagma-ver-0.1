import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: transport.rpc, functions: { invoke: transport.invoke } } }));
import { getRtnEditorial, reviewRtnModule } from "./rtn-editorial";

const payload = { questions: [{ id: "synthetic-question" }], review_note: "Предметная проверка синтетического пакета", module: { title: "Технический модуль" } };
const policy = { version: "source-tracked-v2" as const, legal_assessment: "applicable_norms_and_end_dates_reviewed" as const, legal_review_note: "  Проверены применимые нормы и объявленные предельные даты.  " };
beforeEach(() => vi.resetAllMocks());

describe("question-first editorial API", () => {
  it("accepts only the exact advertised V2 capability, while an old server remains explicitly legacy", async () => {
    const data = { sources: [], banks: [], source_revisions: [], bank_revisions: [], key_sets: [], releases: [] };
    transport.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getRtnEditorial()).resolves.not.toHaveProperty("review_policy_capabilities");
    transport.rpc.mockResolvedValueOnce({ data: { ...data, review_policy_capabilities: { source_tracked_v2: true, version: "unknown", legal_assessment: policy.legal_assessment } }, error: null });
    await expect(getRtnEditorial()).rejects.toThrow("Не удалось подтвердить правила");
  });
  it("sends a substantiated new review to V2 with the exact policy and trimmed assessment", async () => {
    transport.rpc.mockResolvedValue({ data: { key_set_id: "new-key" }, error: null });
    await reviewRtnModule("bank", "revision", payload, policy);
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.rpc).toHaveBeenCalledWith("review_rtn_keys_v2", {
      p_bank_id: "bank", p_bank_revision_id: "revision", p_questions: payload.questions, p_review_note: payload.review_note,
      p_module: payload.module, p_policy: { ...policy, legal_review_note: policy.legal_review_note.trim() },
    });
  });
  it("keeps the legacy RPC signature unchanged when capability is absent", async () => {
    transport.rpc.mockResolvedValue({ data: { key_set_id: "old-server-key" }, error: null });
    await reviewRtnModule("bank", "revision", payload);
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.rpc).toHaveBeenCalledWith("review_rtn_keys", {
      p_bank_id: "bank", p_bank_revision_id: "revision", p_questions: payload.questions, p_review_note: payload.review_note, p_module: payload.module,
    });
  });
  it("rejects a missing substantive legal assessment before any write", async () => {
    await expect(reviewRtnModule("bank", "revision", payload, { ...policy, legal_review_note: "готово" })).rejects.toThrow("от 20 до 2500");
    expect(transport.rpc).not.toHaveBeenCalled();
  });
  it("never falls back to legacy review after an uncertain or rejected V2 write", async () => {
    transport.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "rtn_new_review_required_for_policy_v2" } });
    await expect(reviewRtnModule("bank", "revision", payload, policy)).rejects.toThrow("Прежняя проверка не переоформляется");
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.rpc.mock.calls[0][0]).toBe("review_rtn_keys_v2");
  });
});
