import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reachYandexGoal,
  YANDEX_METRIKA_COUNTER_ID,
} from "../yandexMetrika";

type WindowWithMetrika = Window & {
  ym?: ReturnType<typeof vi.fn>;
};

describe("reachYandexGoal", () => {
  afterEach(() => {
    delete (window as WindowWithMetrika).ym;
  });

  it("reports the confirmed goal to the production counter", () => {
    const ym = vi.fn();
    (window as WindowWithMetrika).ym = ym;

    expect(reachYandexGoal("demo_request_success")).toBe(true);
    expect(ym).toHaveBeenCalledWith(
      YANDEX_METRIKA_COUNTER_ID,
      "reachGoal",
      "demo_request_success",
    );
  });

  it("does not fail the form when Metrika is unavailable or throws", () => {
    expect(reachYandexGoal("demo_request_success")).toBe(false);

    (window as WindowWithMetrika).ym = vi.fn(() => {
      throw new Error("blocked");
    });
    expect(reachYandexGoal("demo_request_success")).toBe(false);
  });
});
