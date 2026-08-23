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
});
