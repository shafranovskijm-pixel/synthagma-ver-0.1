import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WIDGET_SOURCE = resolve(
  process.cwd(),
  "src/components/organization/RequiresAttentionWidget.tsx",
);

describe("RequiresAttentionWidget enrollment safety contract", () => {
  it("never decides an enrollment request or reports a false success", () => {
    const source = fs.readFileSync(WIDGET_SOURCE, "utf8");

    expect(source).not.toMatch(
      /from\(["']enrollment_requests["']\)[\s\S]*?\.update\s*\(/,
    );
    expect(source).not.toContain("toast.success");
    expect(source).not.toContain("Заявка одобрена");
    expect(source).not.toContain("Заявка отклонена");
  });

  it("routes a scoped request to its course and explains the verified flow", () => {
    const source = fs.readFileSync(WIDGET_SOURCE, "utf8");

    expect(source).toContain(
      '.select("id, course_id, full_name, email, created_at, courses(title)")',
    );
    expect(source).toContain("d.tabNavigation.openCourseDetails(request.course_id)");
    expect(source).toContain("Только там подтверждение создаёт и проверяет зачисление");
    expect(source).toContain("Виджет не меняет статус и не зачисляет ученика");
  });
});
