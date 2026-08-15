/**
 * Тесты DOCX-first компилятора: манифест, токены, повторители, приложения,
 * реальный клиентский шаблон и изоляция HTML/DOCX-потоков.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  compileDocumentXml,
  curriculumTitleOfSection,
  expandRepeaterTable,
  numberStudents,
  parseBodyElements,
  uniqueCloneIds,
  validateSnapshot,
  type ContractSnapshot,
  type TemplateManifest,
} from "../compile";
import { formatMoneyRu, moneyToWordsRu, shortNameRu, numberToWordsRu, formatRussianDateLong } from "../money";
import { findUnresolvedTokens } from "../xml";

const TPL_DIR = path.resolve(__dirname, "../../contract-templates/goreltech/company/v1");
const CLIENT_SOURCE_PATH = path.resolve(
  __dirname,
  "../../../../../docs/group-documents/client-templates/goreltech-group-package-v1/source/company_contract.source.doc",
);
const manifest = JSON.parse(fs.readFileSync(path.join(TPL_DIR, "manifest.json"), "utf8")) as TemplateManifest;

const CURRICULUM = "Техническое обслуживание, монтаж, эксплуатация и ремонт взрывозащищенного электрооборудования";

async function templateDocumentXml(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(TPL_DIR, "template.docx")));
  return zip.file("word/document.xml")!.async("string");
}

function baseSnapshot(overrides: Partial<ContractSnapshot> = {}): ContractSnapshot {
  const amount = 15000;
  const scalars: Record<string, string> = {};
  for (const v of manifest.variables) if (!v.scope) scalars[v.token.slice(2, -2)] = `Значение ${v.key}`;
  scalars.PRICE_NUM = formatMoneyRu(amount);
  scalars.PRICE_WORDS = moneyToWordsRu(amount);
  return {
    scalars,
    programs: [{ PROG_TITLE: CURRICULUM, PROG_FORM: "Очная", PROG_COUNT: "2" }],
    students: [1, 2].map((i) => ({
      STUDENT_FIO: `Иванов Иван ${i}`,
      STUDENT_EDU: "высшее",
      STUDENT_CONTACTS: "mail@example.com\n+7 900 000-00-00",
      STUDENT_POSITION: "инженер",
      STUDENT_ADDRESS: "Санкт-Петербург",
      STUDENT_PROGRAM: CURRICULUM,
      STUDENT_DATES: "03.08.2026 — 07.08.2026",
    })),
    curricula: [CURRICULUM],
    totalAmount: amount,
    taxClauseExplicit: true,
    ...overrides,
  };
}

describe("money", () => {
  it("сумма прописью и цифрами", () => {
    expect(numberToWordsRu(15000)).toBe("пятнадцать тысяч");
    expect(formatMoneyRu(15000)).toBe("15 000,00");
    expect(moneyToWordsRu(15000)).toBe("пятнадцать тысяч рублей 00 копеек");
    expect(moneyToWordsRu(1234.56)).toContain("копеек");
    expect(shortNameRu("Иванов Иван Иванович")).toBe("Иванов И.И.");
    expect(formatRussianDateLong("2026-08-03")).toBe("«03» августа 2026 г.");
  });
});

describe("validateSnapshot (blocking rules)", () => {
  it("валидный снимок проходит без замечаний", () => {
    expect(validateSnapshot(manifest, baseSnapshot())).toEqual([]);
  });

  it("блокирует пустое обязательное скалярное поле", () => {
    const s = baseSnapshot();
    s.scalars.CUST_INN = "";
    const issues = validateSnapshot(manifest, s);
    expect(issues.some((i) => i.code === "missing_scalar" && i.token === "[[CUST_INN]]")).toBe(true);
  });

  it("блокирует отсутствие программ и слушателей", () => {
    const issues = validateSnapshot(manifest, baseSnapshot({ programs: [], students: [] }));
    expect(issues.map((i) => i.code)).toContain("no_programs");
    expect(issues.map((i) => i.code)).toContain("no_students");
  });

  it("блокирует незаполненное поле строки слушателя", () => {
    const s = baseSnapshot();
    s.students[1].STUDENT_FIO = "";
    expect(validateSnapshot(manifest, s).some((i) => i.code === "missing_row_value")).toBe(true);
  });

  it("блокирует слушателя с программой вне договора", () => {
    const s = baseSnapshot();
    s.students[0].STUDENT_PROGRAM = "Другая программа";
    expect(validateSnapshot(manifest, s).some((i) => i.code === "student_program_mismatch")).toBe(true);
  });

  it("блокирует расхождение суммы цифрами и прописью", () => {
    const s = baseSnapshot();
    s.scalars.PRICE_WORDS = "десять тысяч рублей 00 копеек";
    expect(validateSnapshot(manifest, s).some((i) => i.code === "price_words_mismatch")).toBe(true);
  });

  it("требует явного выбора формулировки НДС", () => {
    const issues = validateSnapshot(manifest, baseSnapshot({ taxClauseExplicit: false }));
    expect(issues.some((i) => i.code === "tax_clause_not_explicit")).toBe(true);
  });

  it("нумерует слушателей вычисляемым [[N]]", () => {
    expect(numberStudents([{ a: "1" }, { a: "2" }]).map((s) => s.N)).toEqual(["1", "2"]);
  });
});

describe("повторители", () => {
  const table = `<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:r><w:t>Шапка</w:t></w:r></w:p></w:tc></w:tr>` +
    `<w:tr><w:tc><w:p><w:r><w:t>[[N]] [[STUDENT_FIO]]</w:t></w:r></w:p></w:tc></w:tr>` +
    `<w:tr><w:tc><w:p><w:r><w:t>лишняя</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

  it("клонирует прототип и удаляет неиспользованные строки", () => {
    const out = expandRepeaterTable(table, 1, numberStudents([{ STUDENT_FIO: "А" }, { STUDENT_FIO: "Б" }]));
    expect((out.match(/<w:tr>/g) || []).length).toBe(3); // шапка + 2 клона
    expect(out).toContain("1 А");
    expect(out).toContain("2 Б");
    expect(out).not.toContain("лишняя");
    expect(out).toContain("<w:tblPr/>");
  });

  it("выдаёт разные внутренние ID Word каждому клону", () => {
    const row = '<w:p w14:paraId="5D9BAB32" w14:textId="77777777"><w:r><w:t>x</w:t></w:r></w:p>';
    const first = uniqueCloneIds(row, 0);
    const second = uniqueCloneIds(row, 1);
    expect(first).not.toBe(row);
    expect(second).not.toBe(row);
    expect(first).not.toBe(second);
    expect(first).toMatch(/w14:paraId="[0-9A-F]{8}"/);
    expect(first).toMatch(/w14:textId="[0-9A-F]{8}"/);
  });

  it("падает без строки-прототипа", () => {
    expect(() => expandRepeaterTable(table, 9, [{}])).toThrow(/прототип/);
  });
});

describe("реальный шаблон ГОРЭЛТЕХ (docx_ooxml)", () => {
  it("манифест зафиксировал формат, сценарий и версию", () => {
    expect(manifest.template_id).toBe("goreltech.company.paid_education");
    expect(manifest.scenario).toBe("legal_entity_customer");
    expect(manifest.template_version).toBe("1.0.0-draft");
    expect(Object.keys(manifest.repeaters)).toEqual(["programs", "students"]);
  });

  it("контрольная сумма исходного DOCX совпадает с манифестом", async () => {
    const bytes = fs.readFileSync(path.join(TPL_DIR, "template.docx"));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex.toLowerCase()).toBe(String(manifest.template_sha256).toLowerCase());
  });

  it("манифест привязан к точному клиентскому DOC из архива", async () => {
    const bytes = fs.readFileSync(CLIENT_SOURCE_PATH);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(manifest.source_format).toBe("legacy_doc");
    expect(hex.toLowerCase()).toBe(String(manifest.source_sha256).toLowerCase());
  });

  it("каталог приложений сопоставлен с секциями шаблона", async () => {
    const { elements } = parseBodyElements(await templateDocumentXml());
    const titles = Object.values(manifest.conditional_sections!.curricula!.catalog)
      .map((cfg) => curriculumTitleOfSection(elements, cfg.section_index));
    expect(titles).toContain(CURRICULUM);
    expect(titles.every((t) => t.length > 10)).toBe(true);
  });

  it("компиляция заполняет все токены и оставляет только выбранное приложение", async () => {
    const res = compileDocumentXml({ documentXml: await templateDocumentXml(), manifest, snapshot: baseSnapshot() });
    expect(findUnresolvedTokens(res.documentXml)).toEqual([]);
    expect(res.keptCurricula).toEqual([CURRICULUM]);
    expect(res.droppedCurricula.length).toBe(2);
    expect(res.documentXml).toContain("Иванов Иван 1");
    expect(res.documentXml).toContain("Иванов Иван 2");
    expect(res.documentXml).toContain("15 000,00");
    expect(res.documentXml).toContain("пятнадцать тысяч рублей");
    // финальный <w:sectPr> документа не потерян
    expect(res.documentXml).toContain("<w:sectPr");
  });

  it("клонирует строки слушателей в таблице слушателей", async () => {
    const snapshot = baseSnapshot();
    snapshot.students = [1, 2, 3, 4].map((i) => ({ ...baseSnapshot().students[0], STUDENT_FIO: `Слушатель ${i}` }));
    snapshot.programs[0].PROG_COUNT = "4";
    const res = compileDocumentXml({ documentXml: await templateDocumentXml(), manifest, snapshot });
    for (const i of [1, 2, 3, 4]) expect(res.documentXml).toContain(`Слушатель ${i}`);
  });

  it("отклоняет учебный план, отсутствующий в шаблоне", async () => {
    const snapshot = baseSnapshot();
    snapshot.curricula = ["Несуществующая программа"];
    snapshot.programs = [{ PROG_TITLE: "Несуществующая программа", PROG_FORM: "Очная", PROG_COUNT: "2" }];
    snapshot.students = snapshot.students.map((s) => ({ ...s, STUDENT_PROGRAM: "Несуществующая программа" }));
    await expect(async () =>
      compileDocumentXml({ documentXml: await templateDocumentXml(), manifest, snapshot }),
    ).rejects.toThrow(/нет учебного плана/);
  });

  it("не компилирует при отсутствии обязательных данных", async () => {
    const snapshot = baseSnapshot();
    snapshot.scalars.CUST_NAME = "";
    await expect(async () =>
      compileDocumentXml({ documentXml: await templateDocumentXml(), manifest, snapshot }),
    ).rejects.toThrow(/не может быть сформирован/i);
  });

  it("результат остаётся валидным DOCX ZIP без токенов", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(TPL_DIR, "template.docx")));
    const res = compileDocumentXml({ documentXml: await zip.file("word/document.xml")!.async("string"), manifest, snapshot: baseSnapshot() });
    zip.file("word/document.xml", res.documentXml);
    const out = await zip.generateAsync({ type: "uint8array" });
    const reopened = await JSZip.loadAsync(out);
    expect(reopened.file("word/document.xml")).toBeTruthy();
    expect(reopened.file("[Content_Types].xml")).toBeTruthy();
    const xml = await reopened.file("word/document.xml")!.async("string");
    expect(xml.includes("[[")).toBe(false);
    expect(out.byteLength).toBeGreaterThan(100_000);
  });
});
