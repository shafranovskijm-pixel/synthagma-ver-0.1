import { describe, it, expect } from "vitest";
import {
  extractVariables,
  validateVariables,
  renderTemplate,
  escapeHtmlValue,
  buildVariableValues,
} from "@/utils/mailing/mailingVariables";

const recipient = {
  email: "ivan@example.com",
  first_name: "Иван",
  last_name: "Иванов",
  organization: "ООО «Пример»",
  position: "Специалист",
  city: "Москва",
  custom_data: { отдел: "ОТ", evil: '<img src=x onerror="alert(1)">' },
};

describe("mailing variables", () => {
  it("извлекает переменные без дублей", () => {
    expect(extractVariables("{{first_name}} {{ city }} {{first_name}}")).toEqual(["first_name", "city"]);
  });

  it("считает известными базовые и custom-переменные", () => {
    const v = validateVariables("<p>{{first_name}}, {{отдел}}</p>", "Тема {{city}}", ["отдел"]);
    expect(v.ok).toBe(true);
    expect(v.unknown).toEqual([]);
  });

  it("блокирует неизвестную переменную", () => {
    const v = validateVariables("<p>{{unknown_thing}}</p>", "Тема");
    expect(v.ok).toBe(false);
    expect(v.unknown).toEqual(["unknown_thing"]);
  });

  it("экранирует пользовательские значения", () => {
    expect(escapeHtmlValue('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    const html = renderTemplate("<p>{{evil}}</p>", recipient);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("рендерит предпросмотр по данным получателя", () => {
    const html = renderTemplate("<p>{{first_name}} {{last_name}}, {{city}}, {{organization}}</p>", recipient);
    expect(html).toContain("Иван Иванов");
    expect(html).toContain("Москва");
    expect(html).toContain("ООО «Пример»");
  });

  it("формирует name из имени и фамилии", () => {
    expect(buildVariableValues(recipient).name).toBe("Иван Иванов");
  });

  it("оставляет неизвестную переменную как есть (не подставляет пустоту молча)", () => {
    expect(renderTemplate("<p>{{nope}}</p>", recipient)).toContain("{{nope}}");
  });
});
