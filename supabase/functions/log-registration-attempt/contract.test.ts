import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildRegistrationFailureMessage,
  hmacSha256Hex,
  parseRegistrationAttemptPayload,
  readRegistrationAttemptBody,
  REGISTRATION_ATTEMPT_BODY_MAX_BYTES,
} from "./contract";

describe("log-registration-attempt contract", () => {
  it("accepts the known browser fields for JSON and sendBeacon text payloads", async () => {
    const payload = {
      step: "failed",
      attempt_id: "c7c9f389-2e9d-4adc-9fa8-3b77f3f6ea28",
      email: " user@example.test ",
      error_message: "registration failed",
    };

    for (const contentType of ["application/json", "text/plain;charset=UTF-8"]) {
      const request = new Request("https://edge.example.test", {
        method: "POST",
        headers: { "content-type": contentType },
        body: JSON.stringify(payload),
      });
      await expect(readRegistrationAttemptBody(request)).resolves.toMatchObject({
        step: "failed",
        email: "user@example.test",
      });
    }
  });

  it("rejects unknown fields, invalid UUIDs, non-string data, and field overflows", () => {
    expect(() => parseRegistrationAttemptPayload({ step: "failed", admin: true })).toThrow("invalid_payload");
    expect(() => parseRegistrationAttemptPayload({ step: "failed", attempt_id: "not-a-uuid" })).toThrow("invalid_attempt_id");
    expect(() => parseRegistrationAttemptPayload({ step: "failed", email: { value: "x" } })).toThrow("invalid_email");
    expect(() => parseRegistrationAttemptPayload({ step: "failed", phone: "x".repeat(65) })).toThrow("invalid_phone");
  });

  it("rejects unsupported media and oversized request bodies", async () => {
    const wrongMedia = new Request("https://edge.example.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "step=failed",
    });
    await expect(readRegistrationAttemptBody(wrongMedia)).rejects.toMatchObject({ status: 415 });

    const oversized = new Request("https://edge.example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "failed", error_message: "x".repeat(REGISTRATION_ATTEMPT_BODY_MAX_BYTES) }),
    });
    await expect(readRegistrationAttemptBody(oversized)).rejects.toMatchObject({ status: 413 });
  });

  it("escapes and caps every external value before Telegram HTML", () => {
    const message = buildRegistrationFailureMessage({
      step: "failed",
      org_name: `<b>Injected</b> & Co`,
      email: `attacker@example.test\n<b>fake field</b>`,
      error_message: `<script>${"x".repeat(1200)}</script>`,
    }, `<i>127.0.0.1</i>`);

    expect(message).not.toContain("<script>");
    expect(message).not.toContain("<i>127.0.0.1</i>");
    expect(message).toContain("&lt;b&gt;Injected&lt;/b&gt; &amp; Co");
    expect(message.length).toBeLessThan(4096);
  });

  it("creates deterministic opaque HMAC claims without exposing the source identity", async () => {
    const subtle = webcrypto.subtle as SubtleCrypto;
    const source = "user@example.test|203.0.113.9";
    const first = await hmacSha256Hex(source, "service-role-secret", subtle);
    const second = await hmacSha256Hex(source, "service-role-secret", subtle);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("user");
    expect(first).not.toContain("203");
  });
});
