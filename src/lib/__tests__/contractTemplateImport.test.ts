import { describe, it, expect } from "vitest";
import { extractPlaceholders, detectSlots } from "@/lib/contractTemplateImport";

describe("extractPlaceholders", () => {
  it("находит готовые {{variable}} в загруженном шаблоне", () => {
    const html = "<p>Договор {{contract_number}} от {{contract_date}} с {{individual_name}}</p>";
    expect(extractPlaceholders(html)).toEqual(["contract_number", "contract_date", "individual_name"]);
  });

  it("не дублирует и поддерживает raw-синтаксис {{&key}}", () => {
    const html = "<p>{{ students_table }} {{&students_table}} {{price}}</p>";
    expect(extractPlaceholders(html)).toEqual(["students_table", "price"]);
  });

  it("шаблон с готовыми переменными и без слотов-заглушек всё равно сохраняем", () => {
    const html = "<p>Заказчик: {{company_name}}, ИНН {{company_inn}}</p>";
    const slots = detectSlots(html);
    const placeholders = extractPlaceholders(html);
    expect(slots.length).toBe(0);
    expect(placeholders.length).toBeGreaterThan(0);
    // Кнопка «Далее» блокируется только когда нет ни слотов, ни плейсхолдеров.
    expect(slots.length === 0 && placeholders.length === 0).toBe(false);
  });

  it("пустой html не даёт переменных", () => {
    expect(extractPlaceholders("<p>Обычный текст без переменных</p>")).toEqual([]);
  });
});
