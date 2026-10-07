import { beforeEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import { confirmAccountDeletion, getDeletionPreview, getDeletionStatus, resumeAccountDeletion } from "../accountDeletion";

const capability = { requestId: "request-1", statusToken: "opaque-capability" };
const consentVersion = "full-personal-data-v1" as const;
const preview = { revision: "account-deletion-v2", consentVersion, warning: "Удаление аккаунта и указанных данных необратимо.", canDelete: true, planToken: "one-use-plan", ...capability, expiresAt: "2099-01-01T00:00:00Z", categories: [{ key: "profile", label: "Профиль", count: 1, action: "delete" }], blockers: [] };
describe("self-account deletion response boundary", () => {
  beforeEach(() => { invoke.mockReset(); });

  it("uses the server-authenticated account without accepting a target id", async () => {
    invoke.mockResolvedValueOnce({ data: preview, error: null });
    expect(await getDeletionPreview()).toEqual(preview);
    expect(invoke).toHaveBeenCalledWith("account-deletion", { body: { action: "preview" } });
    const receipt = { status: "deleted", requestId: "request-1", completedAt: "2026-10-07T07:00:00Z" };
    invoke.mockResolvedValueOnce({ data: receipt, error: null }).mockResolvedValueOnce({ data: receipt, error: null });
    expect(await confirmAccountDeletion("one-use-plan", "entered-password", capability, consentVersion)).toEqual(receipt);
    expect(invoke).toHaveBeenNthCalledWith(2, "account-deletion", { body: { action: "confirm", planToken: "one-use-plan", password: "entered-password", consentVersion, confirmation: "DELETE_MY_ACCOUNT_AND_PERSONAL_DATA" } });
    expect(invoke).toHaveBeenLastCalledWith("account-deletion", { body: { action: "status", ...capability } });
  });

  it.each([
    { ...preview, blockers: [{ code: "HAS_OWNER", message: "Передайте владение" }] },
    { ...preview, categories: [{ key: "history", label: "История", count: 1, action: "block" }] },
    { ...preview, planToken: null },
    { ...preview, categories: [] },
    { ...preview, categories: [{ key: "profile", label: "Профиль", count: -1, action: "delete" }] },
  ])("refuses an inconsistent deletion permission", async response => {
    invoke.mockResolvedValue({ data: response, error: null });
    await expect(getDeletionPreview()).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
  });

  it.each([
    { ...preview, revision: "account-deletion-v1" },
    { ...preview, consentVersion: undefined },
    { ...preview, consentVersion: "old-consent" },
    { ...preview, warning: undefined },
    { ...preview, warning: "   " },
  ])("rejects outdated or incomplete consent before showing a deletion option", async response => {
    invoke.mockResolvedValue({ data: response, error: null });
    await expect(getDeletionPreview()).rejects.toMatchObject({ code: "INVALID_PREVIEW" });
    expect(invoke.mock.calls.map(call => call[1].body.action)).toEqual(["preview"]);
  });

  it("does not send destructive confirmation with a legacy consent version", async () => {
    await expect(confirmAccountDeletion("old-plan", "password", capability, "old-consent" as typeof consentVersion)).rejects.toMatchObject({ code: "INVALID_CONSENT", outcome: "rejected" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("treats the server's pre-mutation consent refusal as rejected without a recovery request", async () => {
    invoke.mockResolvedValueOnce({ error: { context: new Response(JSON.stringify({ code: "CONSENT_REQUIRED", message: "Подтвердите новые условия удаления" }), { status: 409 }) }, data: null });
    await expect(confirmAccountDeletion("plan", "password", capability, consentVersion)).rejects.toMatchObject({ code: "CONSENT_REQUIRED", outcome: "rejected" });
    expect(invoke.mock.calls.map(call => call[1].body.action)).toEqual(["confirm"]);
  });

  it("does not treat an accepted request or incomplete receipt as deletion", async () => {
    invoke.mockResolvedValue({ data: { status: "accepted", requestId: "request-1" }, error: null });
    await expect(confirmAccountDeletion("plan", "password", capability, consentVersion)).rejects.toMatchObject({ outcome: "unknown" });
    invoke.mockResolvedValue({ data: { status: "deleted", completedAt: "not-a-date" }, error: null });
    await expect(confirmAccountDeletion("plan", "password", capability, consentVersion)).rejects.toMatchObject({ outcome: "unknown" });
  });

  it("distinguishes a known password refusal from a lost confirmation response", async () => {
    invoke.mockResolvedValueOnce({ error: { context: new Response(JSON.stringify({ code: "REAUTH_FAILED", message: "Неверный пароль" }), { status: 403 }) }, data: null });
    await expect(confirmAccountDeletion("plan", "password", capability, consentVersion)).rejects.toMatchObject({ code: "REAUTH_FAILED", outcome: "rejected" });
    invoke.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(confirmAccountDeletion("plan", "password", capability, consentVersion)).rejects.toMatchObject({ outcome: "unknown" });
  });

  it("keeps cleanup pending separate even when returned with an HTTP error", async () => {
    const pending = { status: "cleanup_pending", requestId: "request-1", message: "Обработка не завершена" };
    invoke.mockResolvedValueOnce({ error: { context: new Response(JSON.stringify(pending), { status: 503 }) }, data: null }).mockResolvedValueOnce({ data: pending, error: null });
    expect(await confirmAccountDeletion("plan", "password", capability, consentVersion)).toEqual(pending);
  });

  it("uses read-only status to recover a lost confirmation reply without sending another deletion", async () => {
    const receipt = { status: "deleted", requestId: "request-1", completedAt: "2026-10-07T07:00:00Z" };
    invoke.mockRejectedValueOnce(new TypeError("lost reply")).mockResolvedValueOnce({ data: receipt, error: null });
    expect(await confirmAccountDeletion("plan", "password", capability, consentVersion)).toEqual(receipt);
    expect(invoke.mock.calls.map(call => call[1].body.action)).toEqual(["confirm", "status"]);
  });

  it("does not accept a status receipt for another operation", async () => {
    invoke.mockResolvedValue({ data: { status: "deleted", requestId: "different", completedAt: "2026-10-07T07:00:00Z" }, error: null });
    await expect(getDeletionStatus(capability)).rejects.toMatchObject({ code: "UNCONFIRMED_STATUS" });
  });

  it("resumes an existing operation using only its capability and verifies status afterwards", async () => {
    invoke.mockResolvedValue({ data: { status: "cleanup_pending", requestId: "request-1" }, error: null });
    expect((await resumeAccountDeletion(capability)).status).toBe("cleanup_pending");
    expect(invoke.mock.calls.map(call => call[1].body)).toEqual([{ action: "resume", ...capability }, { action: "status", ...capability }]);
  });

  it("still checks the existing operation when resuming legacy consent is refused", async () => {
    const pending = { status: "cleanup_pending", requestId: "request-1", message: "Удаление по прежнему согласию ещё не завершено" };
    invoke.mockResolvedValueOnce({ error: { context: new Response(JSON.stringify({ code: "CONSENT_REQUIRED", message: "Необходимо новое согласие" }), { status: 409 }) }, data: null })
      .mockResolvedValueOnce({ data: pending, error: null });
    expect(await resumeAccountDeletion(capability)).toEqual(pending);
    expect(invoke.mock.calls.map(call => call[1].body)).toEqual([{ action: "resume", ...capability }, { action: "status", ...capability }]);
  });
});
