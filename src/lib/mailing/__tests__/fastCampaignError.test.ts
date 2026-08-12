import { describe, expect, it, vi } from "vitest";
import { resolveFastCampaignError } from "../fastCampaignError";

describe("resolveFastCampaignError", () => {
  it("prefers the returned function payload", async () => {
    await expect(resolveFastCampaignError(
      { error: "fresh_inbox_seed_required", request_id: "req-1" },
      { message: "Edge Function returned a non-2xx status code" },
    )).resolves.toEqual({ code: "fresh_inbox_seed_required", requestId: "req-1" });
  });

  it("reads a non-2xx JSON body from FunctionsHttpError.context", async () => {
    const json = vi.fn().mockResolvedValue({ error: "queue_insert_failed", request_id: "req-2" });
    const clone = vi.fn().mockReturnValue({ json });

    await expect(resolveFastCampaignError(null, {
      message: "Edge Function returned a non-2xx status code",
      context: { clone },
    })).resolves.toEqual({ code: "queue_insert_failed", requestId: "req-2" });
  });

  it("falls back to the SDK message for a non-JSON gateway response", async () => {
    const clone = vi.fn().mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error("not json")),
      text: vi.fn().mockResolvedValue("gateway timeout"),
    });

    await expect(resolveFastCampaignError(null, {
      message: "Edge Function returned a non-2xx status code",
      context: { clone },
    })).resolves.toEqual({ code: "Edge Function returned a non-2xx status code" });
  });
});
