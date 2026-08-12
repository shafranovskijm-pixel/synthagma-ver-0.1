import { describe, expect, it } from "vitest";
import { buildGroupIntakeCsv } from "../groupIntakeExport";
import { parseRows } from "../../../utils/studentsExcelImport";

describe("group intake export", () => {
  it("keeps the outreach contact separate from import-ready participant fields", () => {
    const csv = buildGroupIntakeCsv([{
      remote_name: "Ответственный заказчика",
      remote_email: "contact@example.test",
      interest_hours: 250,
      campaign_id: "campaign-1",
      review_status: "qualified",
    }], { "campaign-1": "44-ФЗ" });

    const [header, row] = csv.replace(/^\ufeff/, "").split("\r\n");
    expect(header).toContain('"ФИО";"Email";"Группа";"Курс 1"');
    expect(row.startsWith('"";"";"";""')).toBe(true);
    expect(row).toContain('"Ответственный заказчика";"contact@example.test";"250"');
    expect(row).toContain('"Требуются ФИО и личный email каждого участника"');

    const split = (line: string) => line.split(";").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const headers = split(header);
    const completed = split(row);
    completed[0] = "Петров Пётр Петрович";
    completed[1] = "participant@example.test";
    completed[2] = "44-ФЗ — 250 ч";
    completed[3] = "Контрактная система — 250 ч";
    const parsed = parseRows(headers, [completed]);

    expect(parsed.detectedColumns).toMatchObject({ fio: true, email: true, group: true, courses: 1 });
    expect(parsed.rows[0]).toMatchObject({
      full_name: "Петров Пётр Петрович",
      email: "participant@example.test",
      group_name: "44-ФЗ — 250 ч",
      course_titles: ["Контрактная система — 250 ч"],
    });
  });
});
