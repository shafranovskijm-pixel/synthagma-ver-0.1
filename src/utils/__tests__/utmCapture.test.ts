import { beforeEach, describe, expect, it } from "vitest";
import { captureUtmFromUrl, getUtmData } from "../utmCapture";

describe("utmCapture", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("captures Yandex UTM fields and yclid", () => {
    window.history.replaceState(
      {},
      "",
      "/demonstration?utm_source=ya&utm_medium=cpc&utm_campaign=search&utm_term=lms&yclid=click-123",
    );

    captureUtmFromUrl();

    expect(getUtmData()).toMatchObject({
      utm_source: "ya",
      utm_medium: "cpc",
      utm_campaign: "search",
      utm_term: "lms",
      yclid: "click-123",
    });
  });

  it("keeps attribution when the next internal page has no tracking params", () => {
    window.history.replaceState({}, "", "/?utm_source=ya&yclid=first-click");
    captureUtmFromUrl();

    window.history.replaceState({}, "", "/demonstration");
    captureUtmFromUrl();

    expect(getUtmData()).toMatchObject({
      utm_source: "ya",
      yclid: "first-click",
    });
  });

  it("removes credential URL fields without dropping UTM or yclid", () => {
    window.history.replaceState({}, "", "/login?u=synthetic-user&p=synthetic-secret&utm_source=ya&yclid=click-123&next=%2Fstudent");
    captureUtmFromUrl();
    const data = getUtmData();
    expect(data).toMatchObject({ utm_source: "ya", yclid: "click-123" });
    expect(data?.page_url).toContain("next=%2Fstudent");
    expect(JSON.stringify(data)).not.toMatch(/synthetic-user|synthetic-secret/);
  });

  it("repairs previously stored credential URLs before sending attribution", () => {
    localStorage.setItem("utm_capture_v1", JSON.stringify({
      page_url: "https://example.test/login?u=synthetic-user&p=synthetic-secret",
      referrer: "https://example.test/auto-login?token=synthetic-token",
      saved_at: Date.now(), utm_source: "ya",
    }));
    expect(JSON.stringify(getUtmData())).not.toMatch(/synthetic-user|synthetic-secret|synthetic-token/);
    expect(localStorage.getItem("utm_capture_v1")).not.toMatch(/synthetic-user|synthetic-secret|synthetic-token/);
  });
});
