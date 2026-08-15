import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../templates";
import { generateDocument } from "../generate";
import { SAMPLE_CONTEXT } from "../sampleContext";

const byType = (type: string) => {
  const template = TEMPLATES.find((item) => item.doc_type === type);
  if (!template) throw new Error(`Нет шаблона ${type}`);
  return template.body_html;
};

describe("требования ГОРЭЛТЕХ к групповым документам", () => {
  it("печатает приказы и книгу регистрации альбомно", () => {
    for (const type of ["enrollment_order", "expulsion_order", "registration_book"]) {
      expect(byType(type)).toContain("@page{size:A4 landscape");
    }
  });

  it("печатает журнал и остальные документы книжно", () => {
    for (const type of ["student_list", "class_journal", "schedule", "attestation_sheet", "title_page", "pass"]) {
      expect(byType(type)).toContain("@page{size:A4 portrait");
    }
  });

  it("сохраняет единственный префикс города на титульном листе", () => {
    expect(byType("title_page")).toContain("г. {{org_city}} {{year}} г.");
  });

  it("сохраняет полную шапку и место для подписи", () => {
    const types = [
      "enrollment_order",
      "expulsion_order",
      "student_list",
      "class_journal",
      "schedule",
      "attestation_sheet",
      "registration_book",
      "pass",
    ];

    for (const type of types) {
      expect(byType(type)).toContain("{{& org_title_header_html}}");
      expect(byType(type)).toContain("sig-large");
    }
  });

  it("не сокращает ключевые формулировки приказов", () => {
    const enrollment = byType("enrollment_order");
    const expulsion = byType("expulsion_order");

    expect(enrollment).toContain("Федеральным законом");
    expect(enrollment).toContain("Программа дополнительного профессионального образования");
    expect(enrollment).toContain("<th>Часов</th>");
    expect(enrollment).not.toContain("Ляпко Дарья");
    expect(expulsion).toContain("{{expulsion_outcome}}");
    expect(expulsion).toContain("{{program_hours}} академических часов");
  });

  it("объединяет серию и номер и добавляет дату закрытия группы", () => {
    const registration = byType("registration_book");
    expect(registration).toContain("Серия и номер");
    expect(registration).toContain("Дата закрытия группы");
    expect(registration).not.toContain("<th>Серия</th>");
    expect(registration).not.toContain("<th>Номер</th>");
  });

  it("не оставляет шаблонных артефактов в готовом HTML", () => {
    const types = TEMPLATES
      .map((item) => item.doc_type)
      .filter((type) => type !== "contract");

    for (const type of types) {
      const document = generateDocument(SAMPLE_CONTEXT, type, { mode: "blank" });
      expect(document.html, type).not.toMatch(/{{[^}]+}}/);
    }

    const title = generateDocument(SAMPLE_CONTEXT, "title_page", { mode: "blank" });
    expect(title.html).not.toContain("обучающихся 1");
  });
});
