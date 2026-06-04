import { describe, it, expect, beforeEach } from "vitest";
import {
  saveRefCode, getRefCode, clearRefCode,
  savePartnerRef, getPartnerRef, clearPartnerRef,
  captureRefFromUrl,
} from "../referralCookie";

function resetAll() {
  document.cookie.split(";").forEach(c => {
    const name = c.split("=")[0].trim();
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
  window.localStorage.clear();
}

describe("referralCookie", () => {
  beforeEach(() => resetAll());

  it("saves and retrieves ref code", () => {
    saveRefCode("ABC123");
    expect(getRefCode()).toBe("ABC123");
  });

  it("first-touch: second save does NOT overwrite the first", () => {
    saveRefCode("FIRST");
    saveRefCode("SECOND");
    expect(getRefCode()).toBe("FIRST");
  });

  it("clears ref code (cookie + localStorage)", () => {
    saveRefCode("ABC123");
    clearRefCode();
    expect(getRefCode()).toBeNull();
    expect(window.localStorage.getItem("lvbl_ref_code")).toBeNull();
  });

  it("returns null when no ref code set", () => {
    expect(getRefCode()).toBeNull();
  });

  it("falls back to localStorage when cookie was cleared by browser", () => {
    saveRefCode("LS_FALLBACK");
    // Manually clear ONLY the cookie, keep localStorage
    document.cookie = `ref_code=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    expect(getRefCode()).toBe("LS_FALLBACK");
  });

  it("saves and retrieves partner ref", () => {
    savePartnerRef("PARTNER1");
    expect(getPartnerRef()).toBe("PARTNER1");
  });

  it("partner ref first-touch holds", () => {
    savePartnerRef("P1");
    savePartnerRef("P2");
    expect(getPartnerRef()).toBe("P1");
  });

  it("clears partner ref", () => {
    savePartnerRef("PARTNER1");
    clearPartnerRef();
    expect(getPartnerRef()).toBeNull();
  });

  it("captureRefFromUrl reads ?ref= from location.search", () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "?ref=FROM_SEARCH", hash: "" },
      writable: true,
    });
    captureRefFromUrl();
    expect(getRefCode()).toBe("FROM_SEARCH");
  });

  it("captureRefFromUrl reads ?ref= from location.hash (HashRouter / Capacitor)", () => {
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "", hash: "#/register?ref=FROM_HASH&partner_ref=PHASH" },
      writable: true,
    });
    captureRefFromUrl();
    expect(getRefCode()).toBe("FROM_HASH");
    expect(getPartnerRef()).toBe("PHASH");
  });
});
