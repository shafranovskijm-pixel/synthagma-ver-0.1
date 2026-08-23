import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  compileClassJournalXml,
  formatJournalDate,
  initialsFirstNameRu,
  validateClassJournalSnapshot,
  type ClassJournalManifest,
  type ClassJournalSnapshot,
} from "../classJournal";
import { findUnresolvedTokens, splitTopLevel } from "../xml";

const TEMPLATE_DIR = path.resolve(
  __dirname,
  "../../group-doc-templates/goreltech/class-journal/v1",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(TEMPLATE_DIR, "manifest.json"), "utf8"),
) as ClassJournalManifest;

function snapshot(overrides: Partial<ClassJournalSnapshot> = {}): ClassJournalSnapshot {
  return {
    scalars: {
      GROUP_NUMBER: "1-ПК-26",
      PROGRAM_TITLE: "Проектирование электроустановок во взрывоопасных зонах",
      PROGRAM_HOURS: "40",
      INSTRUCTOR_SHORT: "Дроздов Д.В.",
      SIGNATORY_POSITION: "Генеральный директор",
      SIGNATORY_SHORT: "Дроздов Д.В.",
      DATE_1: "13.01.2026",
      DATE_2: "14.01.2026",
      DATE_3: "15.01.2026",
      DATE_4: "16.01.2026",
    },
    students: [
      {
        STUDENT_NAME: "Иванов Иван Иванович",
        MARK_1: "V",
        MARK_2: "V",
        MARK_3: "V",
        MARK_4: "V",
      },
    ],
    ...overrides,
  };
}

function xmlText(xml: string): string {
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function loadTemplate() {
  const bytes = fs.readFileSync(path.join(TEMPLATE_DIR, "template.docx"));
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  return { bytes, zip, documentXml };
}

describe("журнал учёта занятий DOCX-first", () => {
  it("фиксирует клиентский шаблон и четыре явные даты", () => {
    expect(manifest.template_id).toBe("goreltech.group.class_journal");
    expect(manifest.scenario).toBe("group_class_journal");
    expect(manifest.constraints?.training_dates_exact_count).toBe(4);
    expect(manifest.constraints?.no_inferred_instructor).toBe(true);
    expect(manifest.constraints?.no_silent_date_truncation).toBe(true);
    expect(manifest.repeaters.students.minimum_rows).toBe(6);
    expect(manifest.template_version).toBe("1.2.0-client-source");
  });

  it("контрольная сумма файла совпадает с манифестом", async () => {
    const { bytes } = await loadTemplate();
    expect(crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(
      manifest.template_sha256,
    );
  });

  it("сохраняет шапку и логотип клиента", async () => {
    const { zip } = await loadTemplate();
    expect(zip.file("word/header1.xml")).toBeTruthy();
    expect(zip.file("word/media/image1.jpeg")).toBeTruthy();
    expect((await zip.file("word/media/image1.jpeg")!.async("uint8array")).byteLength).toBeGreaterThan(20_000);
  });

  it("заполняет реквизиты и клонирует строку каждого слушателя", async () => {
    const { documentXml } = await loadTemplate();
    const data = snapshot({
      students: [1, 2, 3].map((index) => ({
        STUDENT_NAME: `Слушатель ${index}`,
        MARK_1: "",
        MARK_2: "",
        MARK_3: "",
        MARK_4: "",
      })),
    });
    const result = compileClassJournalXml({ documentXml, manifest, snapshot: data });
    expect(findUnresolvedTokens(result)).toEqual([]);
    expect(result).toContain("1-ПК-26");
    expect(result).toContain("Генеральный директор");
    expect(result).toContain("Дроздов Д.В.");
    for (const index of [1, 2, 3]) expect(result).toContain(`Слушатель ${index}`);
    const table = splitTopLevel(result, ["w:tbl"])[0];
    const rows = splitTopLevel(table.xml, ["w:tr"]);
    expect(rows).toHaveLength(8);
    for (let index = 3; index < 6; index += 1) {
      const reserve = rows[manifest.repeaters.students.header_rows + index];
      expect(xmlText(reserve.xml)).not.toContain("Слушатель");
      expect(xmlText(reserve.xml)).not.toContain("V");
      const firstCell = splitTopLevel(reserve.xml, ["w:tc"])[0];
      expect(xmlText(firstCell.xml)).toBe(String(index + 1));
    }
  });

  it("не обрезает журнал при числе слушателей больше исходного минимума", async () => {
    const { documentXml } = await loadTemplate();
    const data = snapshot({
      students: Array.from({ length: 7 }, (_, index) => ({
        STUDENT_NAME: `Слушатель ${index + 1}`,
        MARK_1: "",
        MARK_2: "",
        MARK_3: "",
        MARK_4: "",
      })),
    });
    const result = compileClassJournalXml({ documentXml, manifest, snapshot: data });
    const rows = splitTopLevel(splitTopLevel(result, ["w:tbl"])[0].xml, ["w:tr"]);
    expect(rows).toHaveLength(9);
    expect(xmlText(rows.at(-1)!.xml)).toContain("Слушатель 7");
  });

  it("не подставляет руководителя поверх явно пустого подписанта", async () => {
    const blankSignatory = snapshot();
    blankSignatory.scalars.SIGNATORY_POSITION = "";
    blankSignatory.scalars.SIGNATORY_SHORT = "";
    expect(validateClassJournalSnapshot(manifest, blankSignatory)).toEqual([]);
    const { documentXml } = await loadTemplate();
    expect(documentXml).toContain("[[SIGNATORY_POSITION]]");
    expect(documentXml).toContain("[[SIGNATORY_SHORT]]");
    expect(xmlText(documentXml)).not.toContain("Генеральный директор");
    const result = compileClassJournalXml({
      documentXml,
      manifest,
      snapshot: blankSignatory,
    });
    expect(findUnresolvedTokens(result)).toEqual([]);
    expect(xmlText(result)).not.toContain("Генеральный директор");
  });

  it("не подменяет неизвестного преподавателя и не обрезает даты", () => {
    const noInstructor = snapshot();
    noInstructor.scalars.INSTRUCTOR_SHORT = "";
    expect(validateClassJournalSnapshot(manifest, noInstructor).map((issue) => issue.code)).toContain(
      "missing_scalar",
    );

    const onlyThreeDates = snapshot();
    onlyThreeDates.scalars.DATE_4 = "";
    expect(validateClassJournalSnapshot(manifest, onlyThreeDates).map((issue) => issue.code)).toContain(
      "invalid_training_dates_count",
    );
  });

  it("в рабочем бланке оставляет даты очных занятий пустыми", async () => {
    const blank = snapshot();
    blank.scalars.DATE_1 = "";
    blank.scalars.DATE_2 = "";
    blank.scalars.DATE_3 = "";
    blank.scalars.DATE_4 = "";

    expect(validateClassJournalSnapshot(manifest, blank, "blank")).toEqual([]);
    const { documentXml } = await loadTemplate();
    const result = compileClassJournalXml({
      documentXml,
      manifest,
      snapshot: blank,
      fillMode: "blank",
    });
    expect(findUnresolvedTokens(result)).toEqual([]);
  });

  it("остаётся валидным DOCX, меняя только word/document.xml", async () => {
    const { zip, documentXml } = await loadTemplate();
    const before = new Map<string, string>();
    for (const [name, entry] of Object.entries(zip.files)) {
      if (!entry.dir && name !== "word/document.xml") {
        before.set(name, crypto.createHash("sha256").update(await entry.async("uint8array")).digest("hex"));
      }
    }

    zip.file("word/document.xml", compileClassJournalXml({ documentXml, manifest, snapshot: snapshot() }));
    const output = await zip.generateAsync({ type: "uint8array" });
    const reopened = await JSZip.loadAsync(output);
    expect(reopened.file("[Content_Types].xml")).toBeTruthy();
    expect(output.byteLength).toBeGreaterThan(100_000);
    expect(findUnresolvedTokens(await reopened.file("word/document.xml")!.async("string"))).toEqual([]);
    for (const [name, hash] of before) {
      const bytes = await reopened.file(name)!.async("uint8array");
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    }
  });

  it("форматирует даты и подпись руководителя как в оригинале", () => {
    expect(formatJournalDate("2026-01-13")).toBe("13.01.2026");
    expect(formatJournalDate("13.01.2026")).toBe("");
    expect(initialsFirstNameRu("Дроздов Дмитрий Викторович")).toBe("Д.В. Дроздов");
  });
});
