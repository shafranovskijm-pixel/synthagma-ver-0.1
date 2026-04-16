import { describe, it, expect, beforeEach } from "vitest";
import { saveRefCode, getRefCode, clearRefCode, savePartnerRef, getPartnerRef, clearPartnerRef } from "../referralCookie";

describe("referralCookie", () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(";").forEach(c => {
      const name = c.split("=")[0].trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
  });

  it("saves and retrieves ref code", () => {
    saveRefCode("ABC123");
    expect(getRefCode()).toBe("ABC123");
  });

  it("clears ref code", () => {
    saveRefCode("ABC123");
    clearRefCode();
    expect(getRefCode()).toBeNull();
  });

  it("returns null when no ref code set", () => {
    expect(getRefCode()).toBeNull();
  });

  it("saves and retrieves partner ref", () => {
    savePartnerRef("PARTNER1");
    expect(getPartnerRef()).toBe("PARTNER1");
  });

  it("clears partner ref", () => {
    savePartnerRef("PARTNER1");
    clearPartnerRef();
    expect(getPartnerRef()).toBeNull();
  });
});
