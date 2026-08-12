import { describe, expect, it } from "vitest";
import { buildFastCampaignSchedule, summarizeFastCampaignSchedule } from "../fastCampaignSchedule";

describe("fast two-day campaign schedule", () => {
  const emails = Array.from({ length: 812 }, (_, index) => `recipient-${index}@example.test`);

  it("allocates 812 recipients across 203 senders over two days", () => {
    const schedule = buildFastCampaignSchedule({
      emails,
      senderCount: 203,
      startDateMsk: "2026-08-13",
    });
    const summary = summarizeFastCampaignSchedule(schedule);

    expect(summary).toEqual({
      total: 812,
      dailyMaximum: 406,
      senderDailyMaximum: 2,
      slotMaximum: 19,
    });
    expect(new Set(schedule.map((item) => item.email)).size).toBe(812);
  });

  it("keeps both daily waves at least five hours apart per sender", () => {
    const schedule = buildFastCampaignSchedule({
      emails,
      senderCount: 203,
      startDateMsk: "2026-08-13",
    });
    for (let day = 0; day < 2; day += 1) {
      for (let sender = 0; sender < 203; sender += 1) {
        const times = schedule
          .filter((item) => item.dayIndex === day && item.senderIndex === sender)
          .map((item) => Date.parse(item.notBefore))
          .sort((a, b) => a - b);
        expect(times).toHaveLength(2);
        expect(times[1] - times[0]).toBeGreaterThanOrEqual(300 * 60_000);
      }
    }
  });

  it("matches the production monitoring checkpoints in Vladivostok", () => {
    const schedule = buildFastCampaignSchedule({
      emails,
      senderCount: 203,
      startDateMsk: "2026-08-13",
    });
    const dueBy = (iso: string) => schedule.filter((item) => item.notBefore <= iso).length;

    // 17:30 Vladivostok = 10:30 MSK = 07:30 UTC.
    expect(dueBy("2026-08-13T07:30:00.000Z")).toBe(56);
    // 03:30 Vladivostok is after the daily 09:00–20:00 MSK window.
    expect(dueBy("2026-08-13T17:30:00.000Z")).toBe(406);
    expect(dueBy("2026-08-14T07:30:00.000Z")).toBe(462);
    expect(dueBy("2026-08-14T17:30:00.000Z")).toBe(812);

    expect(schedule[0].notBefore).toBe("2026-08-13T06:00:00.000Z");
    expect(schedule.at(-1)?.notBefore).toBe("2026-08-14T16:57:55.862Z");
  });

  it("deduplicates recipients and rejects requests above capacity", () => {
    const schedule = buildFastCampaignSchedule({
      emails: ["A@example.test", "a@example.test", "b@example.test"],
      senderCount: 1,
      days: 2,
      startDateMsk: "2026-08-13",
    });
    expect(schedule.map((item) => item.email)).toEqual(["a@example.test", "b@example.test"]);

    expect(() => buildFastCampaignSchedule({
      emails: ["a@example.test", "b@example.test", "c@example.test"],
      senderCount: 1,
      days: 1,
      startDateMsk: "2026-08-13",
    })).toThrow(/capacity exceeded/);
  });
});
