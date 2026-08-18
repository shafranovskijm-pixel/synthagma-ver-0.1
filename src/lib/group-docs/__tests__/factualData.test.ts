import { describe, expect, it } from "vitest";
import {
  LEGACY_LAYOUT_FORMAT,
  buildAttestationBlankRows,
  buildAttestationRowsFromFacts,
  buildJournalBlankRows,
  buildJournalRowsFromFacts,
  buildRegistrationBlankRows,
  buildRegistrationRowsFromFacts,
  documentDataReadiness,
  emptyFactualData,
  journalDateColumns,
  NO_RESULT_TEXT,
} from "../factualData";
import { generateDocument } from "../generate";
import { GROUP_DOCUMENT_TYPES } from "../groupDocuments";
import { PACKAGE_DOC_TYPES } from "../packageTypes";
import { getTemplate } from "../templates";
import type { DocType, GenerationContext } from "../schema";

const students = [
  { user_id: "u1", full_name: "Иванов Иван Иванович" },
  { user_id: "u2", full_name: "Петров Пётр Петрович" },
];

const ctx: GenerationContext = {
  organization: {
    name: 'ЧОУ ДПО "Синтагма"',
    director_name: "Шафрановский М. М.",
  } as any,
  group: {
    number: "1",
    program_title: "Охрана труда",
    program_hours: 40,
    start_date: "2026-01-10",
    end_date: "2026-01-20",
  } as any,
  students: students.map(s => ({ ...s, email: null, phone: null })) as any,
  company: null,
};

describe("factualData: никаких выдуманных значений", () => {
  it("рабочий бланк журнала не содержит отметок", () => {
    const html = buildJournalBlankRows(students);
    expect(html).not.toContain("V");
    expect(html).not.toContain("✓");
  });

  it("отметка ставится только при фактическом завершении урока", () => {
    const facts = [{ user_id: "u1", date: "2026-01-10" }];
    const dates = journalDateColumns(facts);
    const html = buildJournalRowsFromFacts(students, facts, dates);
    expect(html.match(/✓/g) || []).toHaveLength(1);
    expect(html).not.toContain("V</td>");
  });

  it("нет попытки теста — «нет результата», а не оценка", () => {
    const html = buildAttestationRowsFromFacts(students, []);
    expect(html).toContain(NO_RESULT_TEXT);
    expect(html).not.toMatch(/>\s*[345]\s*</);
    expect(buildAttestationBlankRows(students)).not.toMatch(/>\s*[345]\s*</);
  });

  it("оценка считается только из фактической попытки", () => {
    const html = buildAttestationRowsFromFacts(students, [
      { user_id: "u1", score: 9, max_score: 10, date: "2026-01-20" },
    ]);
    expect(html).toContain("90");
    expect(html).toContain(NO_RESULT_TEXT);
  });

  it("finalBlocked при пустом snapshot", () => {
    const r = documentDataReadiness("attestation_sheet", emptyFactualData(), 2);
    expect(r?.finalBlocked).toBe(true);
  });

  it("книга регистрации generic имеет 16 согласованных колонок", () => {
    const template = getTemplate("registration_book")!;
    const headerCount = template.body_html.match(/<th\b/g)?.length || 0;
    const factRow = buildRegistrationRowsFromFacts([{
      full_name: "Иванов Иван Иванович",
      document_type: "Удостоверение",
      document_series: "ПК",
      document_number: "000001",
      reg_number: "1",
      issue_date: "2026-01-20",
      order_number: "1",
      order_date: "2026-01-20",
      birth_date: "1990-01-01",
      gender: "М",
      passport: "2500 000001",
      citizenship: "РФ",
      program: "Охрана труда",
    }], "2026-01-20", "Охрана труда", "1", "2026-01-10", "ЧОУ ДПО Синтагма");
    const blankRow = buildRegistrationBlankRows(students, "2026-01-20", "Охрана труда", "1", "2026-01-10")
      .match(/<tr>.*?<\/tr>/)?.[0] || "";

    expect(headerCount).toBe(16);
    expect(factRow.match(/<td\b/g)).toHaveLength(16);
    expect(factRow).toContain("<td>1990</td>");
    expect(factRow).not.toContain("01.01.1990");
    expect(blankRow.match(/<td\b/g)).toHaveLength(16);
  });
});

describe("generateDocument: статусы и формат макета", () => {
  // Номера всегда приходят с сервера — в тестах передаём зарезервированные.
  const NUMS: Record<string, string> = {
    contract: "2026-001",
    enrollment_order: "УЦ-1/2026",
    expulsion_order: "УЦ-2/2026",
  };
  const legacyTypes = GROUP_DOCUMENT_TYPES.filter(
    t => t.folder === "docs" && t.key !== "contract" && t.key !== "class_journal",
  ).map(t => t.key as DocType);

  it("рабочий бланк всегда draft", () => {
    for (const type of legacyTypes) {
      const doc = generateDocument(ctx, type, { mode: "blank", requestedStatus: "final", numbers: NUMS });
      expect(doc.doc_status).toBe("draft");
      expect(doc.fill_mode).toBe("blank");
      expect(doc.layout_format).toBe(LEGACY_LAYOUT_FORMAT);
    }
  });

  it("final невозможен без фактических данных", () => {
    for (const type of PACKAGE_DOC_TYPES) {
      const doc = generateDocument(ctx, type, {
        mode: "data",
        factual: emptyFactualData(),
        requestedStatus: "final",
        numbers: NUMS,
      });
      expect(doc.fill_mode).toBe("data");
      if (documentDataReadiness(type, emptyFactualData(), ctx.students.length)?.finalBlocked) {
        expect(doc.doc_status).toBe("draft");
      }
    }
  });

  it("оставшиеся восемь legacy-документов помечены legacy_html и предупреждением", () => {
    for (const type of legacyTypes) {
      const doc = generateDocument(ctx, type, { mode: "blank", numbers: NUMS });
      expect(doc.layout_format).toBe(LEGACY_LAYOUT_FORMAT);
      expect(doc.html).toContain("legacy_html");
    }
  });

  it("в сгенерированном HTML нет hardcoded отметок и демо-баллов", () => {
    for (const type of legacyTypes) {
      const doc = generateDocument(ctx, type, { mode: "blank", numbers: NUMS });
      expect(doc.html).not.toMatch(/<td[^>]*>\s*V\s*<\/td>/);
      expect(doc.html).not.toMatch(/<td[^>]*>\s*(9[0-9]|8[0-9])\s*<\/td>/);
    }
  });
});
