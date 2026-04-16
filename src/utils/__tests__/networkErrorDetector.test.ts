import { describe, it, expect } from "vitest";
import { isBlockedBySecuritySoftware } from "../networkErrorDetector";

describe("isBlockedBySecuritySoftware", () => {
  it("returns blocked=false for null", () => {
    expect(isBlockedBySecuritySoftware(null).blocked).toBe(false);
  });

  it("returns blocked=false for HTTP error with status", () => {
    expect(isBlockedBySecuritySoftware({ status: 500, message: "Server error" }).blocked).toBe(false);
  });

  it("detects TypeError: Failed to fetch", () => {
    const err = new TypeError("Failed to fetch");
    const result = isBlockedBySecuritySoftware(err);
    expect(result.blocked).toBe(true);
    expect(result.userMessage).toContain("антивирусом");
  });

  it("detects ERR_BLOCKED_BY_CLIENT", () => {
    const result = isBlockedBySecuritySoftware(new Error("net::ERR_BLOCKED_BY_CLIENT"));
    expect(result.blocked).toBe(true);
  });

  it("detects connection refused", () => {
    const result = isBlockedBySecuritySoftware(new Error("ERR_CONNECTION_REFUSED"));
    expect(result.blocked).toBe(true);
  });

  it("returns blocked=false for regular error", () => {
    expect(isBlockedBySecuritySoftware(new Error("Something went wrong")).blocked).toBe(false);
  });

  it("handles string errors", () => {
    const result = isBlockedBySecuritySoftware("network request failed");
    expect(result.blocked).toBe(true);
  });
});
