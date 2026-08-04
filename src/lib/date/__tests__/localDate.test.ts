import { describe, it, expect, vi, afterEach } from "vitest";
import { localDateIso, localDateIsoPlusMonths } from "../localDate";

describe("localDateIso", () => {
  afterEach(() => vi.useRealTimers());

  it("возвращает локальную календарную дату, а не UTC-дату", () => {
    // 2026-08-04T20:10:00Z = 05.08.2026 06:10 в Asia/Vladivostok (UTC+10)
    const instant = new Date("2026-08-04T20:10:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(instant);

    const expected = [
      instant.getFullYear(),
      String(instant.getMonth() + 1).padStart(2, "0"),
      String(instant.getDate()).padStart(2, "0"),
    ].join("-");

    expect(localDateIso()).toBe(expected);
    // локальные компоненты, не toISOString
    if (instant.getDate() !== instant.getUTCDate()) {
      expect(localDateIso()).not.toBe(instant.toISOString().slice(0, 10));
    }
  });

  it("для явной локальной даты форматирует без сдвига", () => {
    expect(localDateIso(new Date(2026, 7, 5, 6, 10))).toBe("2026-08-05");
    expect(localDateIso(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("сдвиг на месяц остаётся локальным", () => {
    expect(localDateIsoPlusMonths(1, new Date(2026, 7, 5, 6, 10))).toBe("2026-09-05");
  });
});
