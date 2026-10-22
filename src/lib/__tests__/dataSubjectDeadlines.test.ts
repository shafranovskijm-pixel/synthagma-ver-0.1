import { describe, expect, it } from "vitest";
import { dsrIsOverdue, isFederalWorkingDay2026, previewDSRDeadline, dsrDeadlineLabel } from "../dataSubjectDeadlines";

describe("UC023 federal 2026 deadline boundaries", () => {
  it("skips the official January transfer, weekends and holiday rollover", () => {
    expect(isFederalWorkingDay2026("2026-01-09")).toBe(false);
    expect(previewDSRDeadline("access", "2026-01-01")).toBe("2026-01-23");
    expect(previewDSRDeadline("correction", "2026-03-06")).toBe("2026-03-18");
    expect(previewDSRDeadline("access", "2026-04-30")).toBe("2026-05-18");
  });
  it("keeps seven working, thirty calendar and three-day violation duties distinct", () => {
    expect(previewDSRDeadline("correction", "2026-10-22")).toBe("2026-11-02");
    expect(previewDSRDeadline("withdrawal", "2026-10-22")).toBe("2026-11-21");
    expect(previewDSRDeadline("unlawful_processing", "2026-10-22")).toBe("2026-10-27");
    expect(previewDSRDeadline("access", "2026-10-22", 5)).toBe("2026-11-13");
    expect(previewDSRDeadline("correction", "2026-10-22", 1)).toBeNull();
    expect(previewDSRDeadline("cessation", "2026-10-22", 6)).toBeNull();
  });
  it("fails closed for unsupported years, impossible dates and a cross-year calculation", () => {
    expect(previewDSRDeadline("access", "2026-12-24")).toBeNull();
    expect(previewDSRDeadline("access", "2027-01-01")).toBeNull();
    expect(previewDSRDeadline("correction", "2026-02-30")).toBeNull();
    expect(previewDSRDeadline("manual", "2026-10-22")).toBeNull();
    expect(isFederalWorkingDay2026("2027-01-04")).toBeNull();
  });
  it("uses the confirmed zone and never labels an unreviewed historical deadline compliant", () => {
    const request = { status: "in_progress", due_date: "2026-10-22", deadline_details: { state: "calculated" as const, rule_version: "v1", time_zone: "Asia/Vladivostok" } };
    expect(dsrIsOverdue(request, new Date("2026-10-22T16:00:00Z"))).toBe(true);
    expect(dsrIsOverdue({ ...request, deadline_details: null }, new Date("2026-10-24"))).toBe(false);
    expect(dsrIsOverdue({ ...request, status: "resolved" }, new Date("2026-10-24"))).toBe(false);
    expect(dsrDeadlineLabel(null)).toContain("Исторический");
    expect(dsrDeadlineLabel({ state: "unsupported_calendar", rule_version: "v1" })).toContain("ручная проверка");
  });
});
