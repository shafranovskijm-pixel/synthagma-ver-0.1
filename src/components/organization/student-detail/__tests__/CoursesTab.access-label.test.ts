import { describe, expect, it } from "vitest";

import { formatEnrollmentAccessLabel } from "@/components/organization/student-detail/CoursesTab";

describe("formatEnrollmentAccessLabel", () => {
  it("does not call missing metadata unlimited access", () => {
    expect(formatEnrollmentAccessLabel(undefined)).toBe("Доступ не подтверждён");
  });

  it("distinguishes confirmed unlimited access from a numeric limit", () => {
    expect(formatEnrollmentAccessLabel(null)).toBe("Доступ: без ограничений");
    expect(formatEnrollmentAccessLabel(30)).toBe("Доступ: 30 дн.");
  });
});
