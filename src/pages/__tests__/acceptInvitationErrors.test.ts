import { describe, it, expect } from "vitest";
import { extractFunctionError } from "@/pages/AcceptInvitation";

const httpError = (status: number, body?: any) => ({
  message: "Edge Function returned a non-2xx status code",
  context: {
    status,
    json: async () => {
      if (!body) throw new Error("no body");
      return body;
    },
  },
});

describe("Phase 5D.2 — accept invitation error mapping", () => {
  it("uses the JSON error from the function body", async () => {
    const e = await extractFunctionError(
      httpError(403, { error: "Это приглашение отправлено на другой адрес", code: "EMAIL_MISMATCH", request_id: "r1" }),
    );
    expect(e.message).toContain("другой адрес");
    expect(e.code).toBe("EMAIL_MISMATCH");
    expect(e.requestId).toBe("r1");
  });

  it("never surfaces the raw non-2xx text", async () => {
    const e = await extractFunctionError(httpError(500));
    expect(e.message).not.toMatch(/non-2xx/i);
    expect(e.code).toBe("INTERNAL");
  });

  it("maps expiry and already-accepted statuses", async () => {
    expect((await extractFunctionError(httpError(410))).code).toBe("EXPIRED");
    expect((await extractFunctionError(httpError(409))).code).toBe("ALREADY_ACCEPTED");
    expect((await extractFunctionError(httpError(404))).code).toBe("NOT_FOUND");
    expect((await extractFunctionError(httpError(401))).code).toBe("SESSION_EXPIRED");
  });

  it("marks network failures as retryable", async () => {
    const e = await extractFunctionError(new Error("Failed to fetch"));
    expect(e.retryable).toBe(true);
  });

  it("prefers data.error when the invoke returns a body without throwing", async () => {
    const e = await extractFunctionError(null, { error: "Срок действия приглашения истёк", code: "EXPIRED" });
    expect(e.code).toBe("EXPIRED");
  });
});
