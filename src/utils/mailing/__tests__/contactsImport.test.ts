import { describe, it, expect } from "vitest";
import {
  autoDetectMapping,
  buildImportPlan,
  parseCsv,
  isValidEmail,
  customFieldKey,
  mappingHasEmail,
  ColumnMapping,
} from "@/utils/mailing/contactsImport";

const CSV = `Email;Имя;Фамилия;Компания;Город;Отдел
ivan@example.com;Иван;Иванов;ООО Пример;Москва;ОТ
IVAN@example.com;Иван;Дубль;ООО Пример;Москва;ОТ
broken-email;Пётр;Петров;;;
maria@example.com;Мария;Сидорова;ЗАО Тест;Казань;HR
;;;;;
`;

describe("mailing contacts import", () => {
  it("парсит CSV с разделителем ; и заголовками", () => {
    const parsed = parseCsv(CSV);
    expect(parsed.headers).toEqual(["Email", "Имя", "Фамилия", "Компания", "Город", "Отдел"]);
    expect(parsed.rows.length).toBe(4);
  });

  it("автоопределяет сопоставление колонок", () => {
    const parsed = parseCsv(CSV);
    const mapping = autoDetectMapping(parsed.headers);
    expect(mapping[0]).toBe("email");
    expect(mapping[1]).toBe("first_name");
    expect(mapping[2]).toBe("last_name");
    expect(mapping[3]).toBe("organization");
    expect(mapping[4]).toBe("city");
    expect(mapping[5]).toBe("custom");
    expect(mappingHasEmail(mapping)).toBe(true);
  });

  it("валидирует email", () => {
    expect(isValidEmail("a@b.ru")).toBe(true);
    expect(isValidEmail("broken-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("дедуплицирует внутри файла и относительно кампании, считает итоги", () => {
    const parsed = parseCsv(CSV);
    const mapping = autoDetectMapping(parsed.headers);
    const plan = buildImportPlan(parsed, mapping, ["MARIA@example.com"]);

    expect(plan.counts.added).toBe(1);
    expect(plan.toInsert[0].email).toBe("ivan@example.com");
    expect(plan.counts.duplicatesInFile).toBe(1);
    expect(plan.counts.duplicatesInCampaign).toBe(1);
    expect(plan.counts.invalid).toBe(1);
  });

  it("переносит неизвестные колонки в custom_data", () => {
    const parsed = parseCsv(CSV);
    const mapping = autoDetectMapping(parsed.headers);
    const plan = buildImportPlan(parsed, mapping, []);
    expect(plan.customKeys).toContain("отдел");
    expect(plan.toInsert[0].custom_data["отдел"]).toBe("ОТ");
  });

  it("не импортирует без сопоставленного email", () => {
    const parsed = parseCsv(CSV);
    const mapping: ColumnMapping = { 0: "skip", 1: "first_name" };
    expect(mappingHasEmail(mapping)).toBe(false);
    const plan = buildImportPlan(parsed, mapping, []);
    expect(plan.counts.added).toBe(0);
  });

  it("нормализует ключ custom-поля", () => {
    expect(customFieldKey(" Отдел продаж ")).toBe("отдел_продаж");
    expect(customFieldKey("Job Title!")).toBe("job_title");
  });
});
