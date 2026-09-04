import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalDocumentMetadataScalars,
  buildGroupDocumentScalars,
  canonicalizeLegacyDocumentMetadata,
  compileGroupDocumentXml,
  firstPositiveFiniteNumber,
  parseGeneratedHtmlRows,
  resolveLegacyDocumentDate,
  resolveDocumentSignatory,
  validateGroupDocumentPrerequisites,
  validateStudentRowsAgainstRoster,
  type GoreltechCompiledDocumentType,
  type GroupDocumentManifest,
} from "../groupDocument";
import { findUnresolvedTokens, splitTopLevel } from "../xml";
import { shortNameRu } from "../money";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../group-doc-templates/goreltech/group-package/v1/embedded";
import { generateDocument } from "../../../../../src/lib/group-docs/generate";
import { SAMPLE_CONTEXT } from "../../../../../src/lib/group-docs/sampleContext";
import type { DocType } from "../../../../../src/lib/group-docs/schema";

const ROOT = path.resolve(
  __dirname,
  "../../group-doc-templates/goreltech/group-package/v1",
);
const SOURCE_ROOT = path.resolve(
  __dirname,
  "../../../../../docs/group-documents/client-templates/goreltech-group-package-v1/source",
);

const sha256 = (value: Buffer | Uint8Array) =>
  crypto.createHash("sha256").update(value).digest("hex").toUpperCase();

async function zipPart(zip: JSZip, name: string): Promise<Buffer | null> {
  const file = zip.file(name);
  return file ? Buffer.from(await file.async("uint8array")) : null;
}

function xmlText(xml: string): string {
  return (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map((node) => node.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function loadGroupTemplate(docType: string) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "manifests", `${docType}.json`), "utf8"),
  ) as GroupDocumentManifest;
  const template = fs.readFileSync(path.join(ROOT, "templates", `${docType}.docx`));
  const zip = await JSZip.loadAsync(template);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  return { manifest, template, zip, documentXml };
}

function scalarValuesFor(documentXml: string, overrides: Record<string, string> = {}) {
  const scalars: Record<string, string> = {};
  for (const token of Array.from(documentXml.matchAll(/\[\[([A-Z0-9_]+)\]\]/g))) {
    scalars[token[1]] = "";
  }
  return { ...scalars, ...overrides };
}

function emptyRepeaterSources(manifest: GroupDocumentManifest) {
  return manifest.repeaters ? Object.fromEntries(manifest.repeaters.map((repeater) => [repeater.row_source_key, []])) : undefined;
}

describe("групповые DOCX Beta", () => {
  it("превращает HTML-строки только в чистые ячейки", () => {
    const rows = parseGeneratedHtmlRows(
      '<tr><td>1</td><td><b>Иванов &amp; Петров</b></td><td></td></tr>',
      ["N", "NAME", "BASIS"],
    );
    expect(rows).toEqual([{ N: "1", NAME: "Иванов & Петров", BASIS: "" }]);
  });

  it("останавливает документ со старым или неполным составом учеников", () => {
    expect(validateStudentRowsAgainstRoster({
      docType: "student_list",
      fillMode: "blank",
      rows: [{ STUDENT_NAME: "Иванов Иван Иванович" }],
      activeStudentNames: ["Иванов Иван Иванович", "Петров Пётр Петрович"],
    })).toContain("Состав или ФИО");

    expect(validateStudentRowsAgainstRoster({
      docType: "student_list",
      fillMode: "blank",
      rows: [
        { STUDENT_NAME: "Петров Пётр Петрович" },
        { STUDENT_NAME: "Иванов Иван Иванович" },
      ],
      activeStudentNames: ["Иванов Иван Иванович", "Петров Пётр Петрович"],
    })).toBeNull();
  });

  it("не применяет roster gate к расписанию без строк учеников", () => {
    expect(validateStudentRowsAgainstRoster({
      docType: "schedule",
      fillMode: "data",
      rows: [],
      activeStudentNames: ["Иванов Иван Иванович"],
    })).toBeNull();
  });

  it("для заполненной книги регистрации не допускает чужое ФИО", () => {
    expect(validateStudentRowsAgainstRoster({
      docType: "registration_book",
      fillMode: "data",
      rows: [{ STUDENT_NAME: "Посторонний Ученик" }],
      activeStudentNames: ["Иванов Иван Иванович"],
    })).toContain("нет в активном составе");
  });

  it("изолирует фирменную шапку ГОРЭЛТЕХ", () => {
    const goreltech = buildGroupDocumentScalars({
      org_name: 'ООО «Инжиниринговый центр «ГОРЭЛТЕХ»',
      org_short_name: 'ООО «ИЦ «ГОРЭЛТЕХ»',
    });
    const generic = buildGroupDocumentScalars({ org_name: 'ЧОУ ДПО «Другая»' });
    expect(goreltech.ORG_HEADER_LINE_1).toContain("ГОРЭЛТЕХ");
    expect(generic.ORG_HEADER_LINE_1).toBe('ЧОУ ДПО «Другая»');
    expect(generic.ORG_HEADER_LINE_2).toBe("");
  });

  it("сохраняет request override и отличает явно пустого подписанта от отсутствующего", () => {
    const organization = {
      director_position: "Генеральный директор",
      director_name: "Дроздов Дмитрий Викторович",
    };
    expect(resolveDocumentSignatory(undefined, organization)).toEqual({
      position: "Генеральный директор",
      shortName: "Дроздов Д.В.",
      source: "organization_default",
    });
    expect(resolveDocumentSignatory(
      { position: "Руководитель учебного центра", name: "Ляпко Дарья Константиновна" },
      organization,
    )).toEqual({
      position: "Руководитель учебного центра",
      shortName: "Ляпко Д.К.",
      source: "request",
    });
    expect(resolveDocumentSignatory({ position: "", name: "" }, organization)).toEqual({
      position: "",
      shortName: "",
      source: "request",
    });
    expect(resolveDocumentSignatory(undefined, { director_name: "" }).position).toBe("");
  });

  it("канонизирует blank/draft metadata без повышения статуса и номера", () => {
    expect(canonicalizeLegacyDocumentMetadata({
      fillMode: "blank",
      docStatus: "final",
      documentNumber: "УЦ-999/2026",
    })).toEqual({ docStatus: "draft", documentNumber: null, statusWarning: null });
    expect(canonicalizeLegacyDocumentMetadata({
      fillMode: "data",
      docStatus: "draft",
      documentNumber: "УЦ-999/2026",
    })).toEqual({ docStatus: "draft", documentNumber: null, statusWarning: null });
    expect(canonicalizeLegacyDocumentMetadata({
      fillMode: "data",
      docStatus: "final",
      documentNumber: " УЦ-5/2026 ",
      documentDate: "2026-08-24",
      serverVerifiedCriticalRequisites: true,
    })).toEqual({ docStatus: "final", documentNumber: "УЦ-5/2026", statusWarning: null });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: null,
      documentDate: "2026-08-24",
      serverVerifiedCriticalRequisites: true,
    })).toMatchObject({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "expulsion_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: null,
      serverVerifiedCriticalRequisites: true,
    })).toMatchObject({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: "2026-08-24",
      serverVerifiedCriticalRequisites: true,
    })).toEqual({ docStatus: "final", documentNumber: "УЦ-5/2026", statusWarning: null });
  });

  it("fail-closed понижает browser-supplied final без серверного подтверждения", () => {
    const metadata = canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: "2026-08-24",
      serverVerifiedCriticalRequisites: false,
      serverVerificationMessage: "фактические строки не сверены с БД",
    });

    expect(metadata).toMatchObject({ docStatus: "draft", documentNumber: null });
    expect(metadata.statusWarning).toContain("фактические строки не сверены с БД");
    expect(metadata.statusWarning).toContain("сохранён как черновик");
  });

  it("не размножает общую дату пакета и допускает её только как draft fallback", () => {
    expect(resolveLegacyDocumentDate({
      documentDate: "2026-08-21",
      legacySharedDraftDate: "2026-08-25",
      fillMode: "data",
      docStatus: "final",
    })).toBe("2026-08-21");
    expect(resolveLegacyDocumentDate({
      documentDate: null,
      legacySharedDraftDate: "2026-08-25",
      fillMode: "data",
      docStatus: "final",
    })).toBeNull();
    expect(resolveLegacyDocumentDate({
      documentDate: null,
      legacySharedDraftDate: "2026-08-25",
      fillMode: "blank",
      docStatus: "draft",
    })).toBe("2026-08-25");
  });

  it("выбирает только конечный положительный объём программы", () => {
    expect(firstPositiveFiniteNumber(Number.NaN, "не число", "40")).toBe(40);
    expect(firstPositiveFiniteNumber(undefined, "нечисловой courses.duration")).toBe(0);
    expect(firstPositiveFiniteNumber(-1, 0, "72")).toBe(72);
  });

  it("перезаписывает злонамеренные ORDER_* каноническими metadata в snapshot и DOCX", async () => {
    const { manifest, documentXml } = await loadGroupTemplate("enrollment_order");
    const metadata = canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: "2026-08-24",
      serverVerifiedCriticalRequisites: true,
    });
    const scalars = buildGroupDocumentScalars({
      order_number: "УЦ-999/2026",
      order_date: "31.12.2099",
    });
    Object.assign(scalars, buildCanonicalDocumentMetadataScalars({
      documentNumber: metadata.documentNumber,
      documentDate: "2026-08-24",
    }));
    Object.assign(scalars, scalarValuesFor(documentXml, scalars));
    expect(scalars.ORDER_NUMBER).toBe("УЦ-5/2026");
    expect(scalars.ORDER_DATE).toBe("24.08.2026");
    expect(Object.values(scalars)).not.toContain("УЦ-999/2026");
    expect(Object.values(scalars)).not.toContain("31.12.2099");

    const rows = [{
      N: "1",
      STUDENT_NAME: "Фактический Слушатель",
      STUDENT_PROGRAM: "Программа",
      STUDENT_HOURS: "40",
      STUDENT_PERIOD: "24.08.2026",
      STUDENT_BASIS: "",
    }];
    const compiled = compileGroupDocumentXml({
      documentXml,
      manifest,
      snapshot: { scalars, rows },
    });
    expect(xmlText(compiled)).toContain("УЦ-5/2026");
    expect(xmlText(compiled)).toContain("24.08.2026");
    expect(xmlText(compiled)).not.toContain("УЦ-999/2026");
    expect(xmlText(compiled)).not.toContain("31.12.2099");
  });

  it("зеркально проверяет на сервере обязательные скаляры каждого DOCX", () => {
    const expectedFields: Record<string, string[]> = {
      enrollment_order: [
        "org_name", "group_number", "program_title", "program_hours",
        "start_date", "end_date", "students_count",
      ],
      expulsion_order: [
        "org_name", "group_number", "program_title", "program_hours",
        "start_date", "end_date", "students_count",
      ],
      student_list: ["org_name", "group_number", "program_title", "students_count"],
      class_journal: [
        "org_name", "group_number", "program_title", "program_hours",
        "instructor_name", "training_dates_4", "students_count",
      ],
      schedule: ["program_title", "program_hours", "instructor_name"],
      attestation_sheet: [
        "org_name", "group_number", "program_title", "program_hours",
        "start_date", "end_date", "instructor_name", "students_count",
      ],
      registration_book: [
        "org_name", "group_number", "program_title", "start_date", "end_date", "students_count",
      ],
      title_page: ["org_name", "group_number", "program_title", "start_date", "end_date"],
      pass: [
        "org_name", "group_number", "program_title", "program_hours",
        "start_date", "end_date", "students_count",
      ],
    };
    const emptyContext = {
      org_name: "",
      group_number: "",
      program_title: "",
      program_hours: 0,
      start_date: "",
      end_date: "",
      instructor_name: "",
      training_dates: [],
      students_count: 0,
    };
    const completeContext = {
      org_name: "ООО «ИЦ «ГОРЭЛТЕХ»",
      group_number: "1-ПК-26",
      program_title: "Программа повышения квалификации",
      program_hours: 40,
      start_date: "2026-01-13",
      end_date: "2026-01-16",
      instructor_name: "Иванов Иван Иванович; Петров Пётр Петрович; Сидоров Сидор Сидорович",
      training_dates: ["2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16"],
      students_count: 1,
    };

    for (const [docType, fields] of Object.entries(expectedFields)) {
      const issues = validateGroupDocumentPrerequisites({
        docType: docType as GoreltechCompiledDocumentType,
        fillMode: "data",
        context: emptyContext,
      });
      expect(issues.map((issue) => issue.field).sort(), docType).toEqual([...fields].sort());
      expect(validateGroupDocumentPrerequisites({
        docType: docType as GoreltechCompiledDocumentType,
        fillMode: "data",
        context: completeContext,
      }), docType).toEqual([]);
    }

    expect(validateGroupDocumentPrerequisites({
      docType: "class_journal",
      fillMode: "blank",
      context: { ...completeContext, training_dates: [] },
    })).toEqual([]);
    for (const invalidHours of [Number.NaN, "не число"]) {
      const issues = validateGroupDocumentPrerequisites({
        docType: "schedule",
        fillMode: "data",
        context: { ...completeContext, program_hours: invalidHours },
      });
      expect(issues.map((issue) => issue.field)).toContain("program_hours");
    }
    expect(validateGroupDocumentPrerequisites({
      docType: "class_journal",
      fillMode: "data",
      context: { ...completeContext, training_dates: ["2026-01-13", "2026-01-14", "2026-01-15"] },
    }).map((issue) => issue.field)).toEqual(["training_dates_4"]);
  });

  it("компилирует все восемь шаблонов без артефактов", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));
    expect(manifestFiles).toHaveLength(8);

    for (const filename of manifestFiles) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const template = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      const zip = await JSZip.loadAsync(template);
      const xml = await zip.file("word/document.xml")!.async("string");
      const scalars: Record<string, string> = {};
      for (const token of Array.from(xml.matchAll(/\[\[([A-Z0-9_]+)\]\]/g))) {
        scalars[token[1]] = token[1] === "ORG_HEADER_LINE_2" ? "" : `value-${token[1]}`;
      }
      const rows = manifest.row_tokens.length
        ? [Object.fromEntries(manifest.row_tokens.map((token) => [token, `row-${token}`]))]
        : [];
      const compiled = compileGroupDocumentXml({
        documentXml: xml,
        manifest,
        snapshot: { scalars, rows, rowsBySource: emptyRepeaterSources(manifest) },
      });
      expect(findUnresolvedTokens(compiled), manifest.template_id).toEqual([]);
      expect(compiled, manifest.template_id).not.toContain("[[");
    }
  });

  it("сохраняет минимальное число строк исходных бланков и оставляет резерв пустым", async () => {
    const expectedMinimumRows: Record<string, number> = {
      enrollment_order: 6,
      expulsion_order: 6,
      student_list: 6,
      attestation_sheet: 6,
      registration_book: 4,
      pass: 6,
    };

    for (const [docType, minimumRows] of Object.entries(expectedMinimumRows)) {
      const { manifest, documentXml } = await loadGroupTemplate(docType);
      const repeater = manifest.repeater || manifest.repeaters![0];
      const rowTokens = manifest.repeaters?.[0].row_tokens || manifest.row_tokens;
      expect(repeater.minimum_rows, docType).toBe(minimumRows);
      const actualRow = Object.fromEntries(rowTokens.map((token) => [token, ""]));
      actualRow.N = "1";
      actualRow.STUDENT_NAME = "Фактический Слушатель";
      const compiled = compileGroupDocumentXml({
        documentXml,
        manifest,
        snapshot: {
          scalars: scalarValuesFor(documentXml),
          rows: [actualRow],
          rowsBySource: manifest.repeaters ? {
            ...emptyRepeaterSources(manifest), expulsion_with_issuance: [actualRow],
          } : undefined,
        },
      });
      const table = splitTopLevel(compiled, ["w:tbl"])[repeater.table_index];
      const rows = splitTopLevel(table.xml, ["w:tr"]);
      expect(rows, docType).toHaveLength(repeater.header_rows + minimumRows);
      expect(xmlText(rows[repeater.header_rows].xml), docType).toContain(
        "Фактический Слушатель",
      );
      for (let index = 1; index < minimumRows; index += 1) {
        const reserve = xmlText(rows[repeater.header_rows + index].xml);
        expect(reserve, `${docType}: reserve row ${index + 1}`).not.toContain(
          "Фактический Слушатель",
        );
        expect(reserve, `${docType}: reserve row ${index + 1}`).not.toContain("V");
        const firstCell = splitTopLevel(
          rows[repeater.header_rows + index].xml,
          ["w:tc"],
        )[0];
        expect(xmlText(firstCell.xml), `${docType}: reserve row number`).toBe(String(index + 1));
      }
    }
  });

  it("не обрезает список, если фактических слушателей больше исходного минимума", async () => {
    const { manifest, documentXml } = await loadGroupTemplate("student_list");
    const rows = Array.from({ length: 8 }, (_, index) =>
      Object.fromEntries(
        manifest.row_tokens.map((token) => [
          token,
          token === "N" ? String(index + 1) : token === "STUDENT_NAME" ? `Слушатель ${index + 1}` : "",
        ]),
      ));
    const compiled = compileGroupDocumentXml({
      documentXml,
      manifest,
      snapshot: { scalars: scalarValuesFor(documentXml), rows },
    });
    const table = splitTopLevel(compiled, ["w:tbl"])[manifest.repeater!.table_index];
    expect(splitTopLevel(table.xml, ["w:tr"])).toHaveLength(
      manifest.repeater!.header_rows + rows.length,
    );
    expect(xmlText(table.xml)).toContain("Слушатель 8");
  });

  it("сохраняет точные согласованные формулировки без сокращения ДПО", async () => {
    const enrollment = xmlText((await loadGroupTemplate("enrollment_order")).documentXml);
    const expulsion = xmlText((await loadGroupTemplate("expulsion_order")).documentXml);
    expect(enrollment).toContain(
      "дополнительной профессиональной образовательной программе повышения квалификации",
    );
    expect(enrollment).toContain("Часов");
    expect(expulsion).toContain("Отчислить без выдачи удостоверений");
    expect(`${enrollment} ${expulsion}`).not.toMatch(/(^|[\s«(])ДПО(?=$|[\s»),.])/u);
  });

  describe("независимые таблицы приказа об отчислении", () => {
    const WITH = "expulsion_with_issuance";
    const WITHOUT = "expulsion_without_issuance";
    const row = (name: string, index = 1) => ({ N: String(index), STUDENT_NAME: name,
      STUDENT_PROGRAM: "Тестовая программа & безопасность", STUDENT_HOURS: "40",
      STUDENT_PERIOD: "01.09.2026–04.09.2026", STUDENT_BASIS: "" });

    async function compileLists(withRows: Array<Record<string, string>>, withoutRows: Array<Record<string, string>>) {
      const loaded = await loadGroupTemplate("expulsion_order");
      const xml = compileGroupDocumentXml({
        documentXml: loaded.documentXml, manifest: loaded.manifest,
        snapshot: { scalars: scalarValuesFor(loaded.documentXml, { STUDENT_NAME: "SCALAR MUST NOT LEAK" }),
          rows: [row("COMMON ROSTER MUST NOT LEAK")], rowsBySource: { [WITH]: withRows, [WITHOUT]: withoutRows } },
      });
      expect(findUnresolvedTokens(xml)).toEqual([]);
      expect(xml).not.toContain("MUST NOT LEAK");
      return { ...loaded, xml, tables: splitTopLevel(xml, ["w:tbl"]) };
    }

    it.each<[string, Array<Record<string, string>>, Array<Record<string, string>>]>([
      ["по одному в каждой таблице", [row("Выдача & Первый")], [row("Без выдачи <Второй>")]],
      ["все с выдачей", [row("Выдача 1"), row("Выдача 2", 2)], []],
      ["все без выдачи", [], [row("Без выдачи 1"), row("Без выдачи 2", 2)]],
      ["оба списка пустые", [], []],
      ["больше исходной ёмкости", Array.from({ length: 9 }, (_, index) => row(`Выдача ${index + 1}`, index + 1)),
        Array.from({ length: 4 }, (_, index) => row(`Без выдачи ${index + 1}`, index + 1))],
    ])("не смешивает списки: %s", async (_name, withRows, withoutRows) => {
      const { tables } = await compileLists(withRows, withoutRows);
      expect(tables).toHaveLength(2);
      for (const [index, items, otherItems, minimum] of [
        [0, withRows, withoutRows, 6], [1, withoutRows, withRows, 1],
      ] as const) {
        const table = tables[index].xml;
        expect(splitTopLevel(table, ["w:tr"])).toHaveLength(2 + Math.max(minimum, items.length));
        for (const item of items) expect(xmlText(table)).toContain(item.STUDENT_NAME);
        for (const item of otherItems) expect(xmlText(table)).not.toContain(item.STUDENT_NAME);
        for (const bodyRow of splitTopLevel(table, ["w:tr"]).slice(2)) {
          const cells = splitTopLevel(bodyRow.xml, ["w:tc"]);
          expect(xmlText(cells[5].xml)).toBe("");
        }
      }
      if (!withoutRows.length) {
        for (const cell of splitTopLevel(splitTopLevel(tables[1].xml, ["w:tr"])[2].xml, ["w:tc"])) {
          expect(xmlText(cell.xml)).toBe(""); // Empty table1 must not gain a synthetic row number.
        }
      }
      const withBody = splitTopLevel(tables[0].xml, ["w:tr"]).slice(2);
      expect(withBody[0].xml.match(/<w:vMerge w:val="restart"\/>/g)).toHaveLength(4);
      for (const continuation of withBody.slice(1)) expect(continuation.xml.match(/<w:vMerge\/>/g)).toHaveLength(4);
      expect(tables[1].xml).not.toContain("<w:vMerge");
      const clonedParagraphIds = tables.flatMap((table) => splitTopLevel(table.xml, ["w:tr"]).slice(2)
        .flatMap((part) => [...part.xml.matchAll(/w14:paraId="([A-Fa-f0-9]+)"/g)].map((match) => match[1])));
      expect(new Set(clonedParagraphIds).size).toBe(clonedParagraphIds.length);
    });

    it("сохраняет ZIP-части, оба заголовка, поля, свойства таблиц и текст вне таблиц", async () => {
      const { zip, xml, documentXml, template, manifest, tables } = await compileLists([row("Ученик с выдачей")], [row("Ученик без выдачи")]);
      const originalTables = splitTopLevel(documentXml, ["w:tbl"]);
      for (let index = 0; index < 2; index += 1) {
        expect(tables[index].xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]).toBe(originalTables[index].xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]);
        expect(tables[index].xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]).toBe(originalTables[index].xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]);
        const beforeRows = splitTopLevel(originalTables[index].xml, ["w:tr"]);
        const afterRows = splitTopLevel(tables[index].xml, ["w:tr"]);
        expect(afterRows.slice(0, 2).map((part) => part.xml)).toEqual(beforeRows.slice(0, 2).map((part) => part.xml));
        expect(afterRows[2].xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g)).toEqual(beforeRows[2].xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g));
      }
      const blankScalarXml = compileGroupDocumentXml({ documentXml, manifest,
        snapshot: { scalars: scalarValuesFor(documentXml), rows: [], rowsBySource: { [WITH]: [], [WITHOUT]: [] } } });
      const withoutTables = (value: string) => value.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, "");
      expect(withoutTables(xml)).toBe(withoutTables(blankScalarXml));
      expect(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
      const original = await JSZip.loadAsync(template);
      zip.file("word/document.xml", xml);
      const generated = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
      expect(Object.keys(generated.files).sort()).toEqual(Object.keys(original.files).sort());
      for (const part of Object.keys(original.files).filter((part) => !part.endsWith("/") && part !== "word/document.xml")) {
        expect(await zipPart(generated, part), part).toEqual(await zipPart(original, part));
      }
    });

    it.each(["missing-both", "missing-without", "non-array", "inherited-key", "missing-row-field"]) (
      "не подставляет общий список или scalars при некорректном источнике: %s", async (mode) => {
        const { manifest, documentXml } = await loadGroupTemplate("expulsion_order");
        let sources: unknown = { [WITH]: [], [WITHOUT]: [] };
        if (mode === "missing-both") sources = undefined;
        if (mode === "missing-without") sources = { [WITH]: [] };
        if (mode === "non-array") sources = { [WITH]: [], [WITHOUT]: { length: 0 } };
        if (mode === "inherited-key") sources = Object.assign(Object.create({ [WITHOUT]: [] }), { [WITH]: [] });
        if (mode === "missing-row-field") sources = { [WITH]: [], [WITHOUT]: [{ STUDENT_NAME: "Неполный" }] };
        expect(() => compileGroupDocumentXml({ documentXml, manifest,
          snapshot: { scalars: scalarValuesFor(documentXml), rows: [row("Общий список")],
            rowsBySource: sources as Record<string, Array<Record<string, string>>> } })).toThrow(/источник.*строк|поля источника строк/);
      },
    );

    it.each(["mixed", "duplicate-table", "duplicate-source", "missing-numbering", "missing-table", "empty-repeaters"]) (
      "отклоняет некорректный multi manifest: %s", async (mode) => {
        const { manifest, documentXml } = await loadGroupTemplate("expulsion_order");
        if (mode === "mixed") manifest.repeater = manifest.repeaters![0];
        if (mode === "duplicate-table") manifest.repeaters![1].table_index = 0;
        if (mode === "duplicate-source") manifest.repeaters![1].row_source_key = WITH;
        if (mode === "missing-numbering") delete (manifest.repeaters![1] as { number_blank_rows?: boolean }).number_blank_rows;
        if (mode === "missing-table") manifest.repeaters![1].table_index = 10;
        if (mode === "empty-repeaters") manifest.repeaters = [];
        expect(() => compileGroupDocumentXml({ documentXml, manifest, snapshot: {
          scalars: scalarValuesFor(documentXml), rows: [], rowsBySource: { [WITH]: [], [WITHOUT]: [] },
        } })).toThrow();
      },
    );

    it("версионирует только приказ, не меняет исходник и не наследует старую отметку Word QA", async () => {
      const { manifest, template, documentXml } = await loadGroupTemplate("expulsion_order");
      expect(manifest.schema_version).toBe(2);
      expect(manifest.template_version).toBe("1.3.1-signature-wrap");
      expect(manifest.repeater).toBeNull();
      expect(manifest.row_source_key).toBeNull();
      expect(manifest.row_tokens).toEqual([]);
      expect(manifest.qa?.status).toBe("pending_actual_word_visual_review");
      expect(manifest.qa?.renderer).toBeUndefined();
      expect(sha256(fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename))))
        .toBe("3041B526683DBB4B5E14FFE266E04A7809076C4CC1CB209C08023E4A45087B99");
      // The separately approved signature-layout correction does not change
      // either repeater table, including borders, merge properties and text.
      expect(Array.from(documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g))
        .map((match) => sha256(Buffer.from(match[0])))).toEqual([
        "85DD8AF8BA46DA5C941DD5CA196CEF94C705C20662CCBF287E12B9A5B3EB0492",
        "BA054F5E13F0AA613B1C00A872992A8FB5F7CF4ADD6DA51D1F52DBC976F7D33B",
      ]);
      const entry = GROUP_DOCUMENT_TEMPLATE_BUNDLE.expulsion_order;
      expect(Buffer.from(entry.templateBase64, "base64")).toEqual(template);
      expect(JSON.parse(entry.manifestJson)).toEqual(manifest);
    });
  });

  it("сохраняет байты остальных семи шаблонов, включая исправленный пропуск, при переносе длинных подписей", async () => {
    const unchanged = {
      enrollment_order: ["1A5E190569CE7CB152B39C644B3C7200DB88053F5BC9FD4E1F8D9FDE08BAB54C", "5686177DC3FA58DDEE1F1996935C847C9C54554346778054A157D1177B41FD87"],
      student_list: ["1D4FD144831545AEF7EDEAFBA1650386AD925B54ADE7CC9ABD65B04F26BD4AC3", "B9AD5FB7C0B0BD59575E48E7DF9A7133A6D470B278D4A2373A23296703692784"],
      schedule: ["6CC810BE349D63F62B89BEA60CB0FC0C64DA52F8B85697C85247E01087527ACF", "A755E1EBB11A29EC173A7F83F5D57263D11A4DA609D6D18D36B3F61E6E092B22"],
      registration_book: ["B221BF20A495B32DDC2ABB5510EA1F7A0C5A12ABCC01E3EEAC0C6388A52D4ED8", "D7E245E7C3DDF3D2272ADBD44A300105A56781A1F602C924A4402F94CD6365C9"],
      title_page: ["41D7D2103B5BD725D8DC3661D90599BFD00413EEE080560B8887D87A9BAD5E69", "2132D9727675AE8F293DE32372F52EDE85635A9A126BD5CEC6FA4EFCED5B767D"],
      pass: ["5E7D95F115609B1C1B0B7DF588C042364D33045FAFEBBE05AF7F1ECE2B4D35FB", "3E0E6D70D13730AC22E51E5D8541EC8722F5D8C0882EBC0613FB49928BDC6CBC"],
    };
    for (const [docType, hashes] of Object.entries(unchanged)) {
      expect(sha256(fs.readFileSync(path.join(ROOT, "templates", `${docType}.docx`))), docType).toBe(hashes[0]);
      const entry = GROUP_DOCUMENT_TEMPLATE_BUNDLE[docType as keyof typeof GROUP_DOCUMENT_TEMPLATE_BUNDLE];
      // Git may checkout CRLF on Windows and LF on CI; compare the exact JSON content.
      expect(JSON.parse(fs.readFileSync(path.join(ROOT, "manifests", `${docType}.json`), "utf8")), docType).toEqual(JSON.parse(entry.manifestJson));
      expect(sha256(Buffer.from(JSON.stringify(entry))), docType).toBe(hashes[1]);
    }
    const journal = path.resolve(ROOT, "../../class-journal/v1");
    for (const [filename, expected] of [
      ["template.docx", "D127540999259FEDB167D43CBDBFF2E5F8E67099834FD7EA31E789E62692049D"],
      ["manifest.json", "A6FE80B9ECAAB289819A7E5EC263C1B3B0848D666FE19A8208A0AAB8A46B45C3"],
      ["embedded.ts", "25EAF6EC371B7AB908619A247DD576FFAB980C22BE48C72B657D5EEDE0261913"],
    ]) {
      const bytes = fs.readFileSync(path.join(journal, filename));
      expect(sha256(filename.endsWith(".docx") ? bytes : Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))), filename).toBe(expected);
    }
  });

  describe("читаемость пропуска в согласованной книжной ориентации", () => {
    it("задаёт 13 half-points каждому печатающему run и меняет поля только четырёх ячеек дат", async () => {
      const { manifest, template, zip, documentXml } = await loadGroupTemplate("pass");
      expect(manifest.template_version).toBe("1.2.0-portrait-readability");
      expect(manifest.qa?.status).toBe("pending_actual_word_visual_review");
      expect(manifest.qa?.renderer).toBeUndefined();
      expect(sha256(template)).toBe(manifest.template_sha256);
      const source = fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename));
      expect(sha256(source)).toBe("4BF9F40565934CB8363DADD796ADE74B088242FFC0AA6DB9E251241A36F83DFD");
      const sourceZip = await JSZip.loadAsync(source);
      for (const part of Object.keys(sourceZip.files).filter(name => !name.endsWith("/") && name !== "word/document.xml")) {
        expect(await zipPart(zip, part), part).toEqual(await zipPart(sourceZip, part));
      }
      const table = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0];
      expect(Array.from(table.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(match => Number(match[1])))
        .toEqual([348, 2434, 1304, 1825, 1391, 503, 522, 521, 452]);
      const runs = Array.from(table.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)).map(match => match[0]).filter(run => xmlText(run));
      expect(runs.length).toBeGreaterThan(15);
      for (const run of runs) {
        expect(run.match(/<w:sz\b[^>]*w:val="13"/g), xmlText(run)).toHaveLength(1);
        expect(run.match(/<w:szCs\b[^>]*w:val="13"/g), xmlText(run)).toHaveLength(1);
      }
      const rows = splitTopLevel(table, ["w:tr"]);
      const withMargins: string[] = [];
      rows.forEach((row, rowIndex) => splitTopLevel(row.xml, ["w:tc"]).forEach((cell, cellIndex) => {
        const margins = cell.xml.match(/<w:tcMar\b[\s\S]*?<\/w:tcMar>/)?.[0];
        if (!margins) return;
        withMargins.push(`${rowIndex}:${cellIndex}`);
        expect(margins).toBe('<w:tcMar><w:left w:w="54" w:type="dxa"/><w:right w:w="54" w:type="dxa"/></w:tcMar>');
      }));
      expect(withMargins).toEqual(["1:5", "1:6", "1:7", "1:8"]);
      // Hash of the previously retained pass, stripping only the approved
      // run sizes (and resulting empty rPr wrappers) and date-cell margins.
      // All other XML (including red names,
      // paragraph indents, borders, widths and section properties) must match.
      const withoutApprovedChanges = documentXml.replace(/<w:r\b[\s\S]*?<\/w:r>/g,
        run => run.replace(/<w:sz(?:Cs)?\b[^>]*\/>/g, "").replace(/<w:rPr><\/w:rPr>/g, ""))
        .replace(/<w:tcMar\b[\s\S]*?<\/w:tcMar>/g, "");
      expect(sha256(Buffer.from(withoutApprovedChanges))).toBe("3F5FAAC78A4783E368712ED89D1926E01556726D9E6ED5C19F540923E9284AD3");
      expect(sha256(Buffer.from(documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, ""))))
        .toBe("E3E08E78934C4EE018BAA394420E57E132076B34DD616001D7BAFB61C2E13BD2");
      expect(documentXml).toContain('w:w="11906" w:h="16838"');
      expect(Buffer.from(GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass.templateBase64, "base64")).toEqual(template);
      expect(JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass.manifestJson)).toEqual(manifest);
    });

    it("печатает даты в две строки, полные ФИО/email и исходные отметки без сжатия или сокращений", async () => {
      const { manifest, documentXml } = await loadGroupTemplate("pass");
      const name = "ТЕСТОВЫЙ Однофамилец Примерович";
      const email = "synthetic.learner1@example.invalid";
      const compiled = compileGroupDocumentXml({ documentXml, manifest, snapshot: {
        scalars: scalarValuesFor(documentXml, { DAY1_DATE: "01.09.\n2026", DAY2_DATE: "02.09.\n2026", DAY3_DATE: "03.09.\n2026", DAY4_DATE: "04.09.\n2026" }),
        rows: [{ N: "1", STUDENT_NAME: name, COMPANY: "ТЕСТ", EMAIL: email, PHONE: "+7 (000) 000-00-01", DAY_1: "ОП", DAY_2: "0", DAY_3: "<&>", DAY_4: "[[X]]" }],
      } });
      const table = compiled.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0];
      const rows = splitTopLevel(table, ["w:tr"]);
      splitTopLevel(rows[1].xml, ["w:tc"]).slice(-4).forEach((cell, index) => {
        expect(xmlText(cell.xml)).toBe(`0${index + 1}.09.2026`);
        expect(cell.xml.match(/<w:br\s*\/>/g)).toHaveLength(1);
        expect(cell.xml).toContain(`0${index + 1}.09.</w:t><w:br/><w:t xml:space="preserve">2026`);
      });
      const cells = splitTopLevel(rows[2].xml, ["w:tc"]);
      expect(xmlText(cells[1].xml)).toBe(name);
      expect(xmlText(cells[3].xml)).toBe(email);
      expect(cells[1].xml).toContain('<w:color w:val="EE0000"/>');
      expect(cells.slice(-4).map(cell => xmlText(cell.xml).replace(/&#91;/g, "[")))
        .toEqual(["ОП", "0", "<&>", "[[X]]"]);
      for (const run of Array.from(table.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)).map(match => match[0]).filter(run => xmlText(run))) {
        expect(run, xmlText(run)).toContain('<w:sz w:val="13"/>');
        expect(run, xmlText(run)).toContain('<w:szCs w:val="13"/>');
      }
      expect(findUnresolvedTokens(compiled)).toEqual([]);
    });
  });

  describe("точечное выравнивание подписей без изменения исходных таблиц", () => {
    const specs = {
      expulsion_order: {
        version: "1.3.1-signature-wrap", stops: [8000, 12800], width: 15167, pairs: 2,
        sourceHash: "3041B526683DBB4B5E14FFE266E04A7809076C4CC1CB209C08023E4A45087B99",
        unchangedHash: "BDAEFF4B5F4B367368DB8669EFF317435C7A47D203790770760D47A6AF37C559",
      },
      attestation_sheet: {
        version: "1.2.1-signature-wrap", stops: [4800, 7600], width: 9355, pairs: 3,
        sourceHash: "1A1DCDD74B904A6EF3265728679FB6022677EB05F1228CB753695331CDC27CA1",
        unchangedHash: "5EFF42378EFE6DC4571AD477D4BD7A284673C3BCF43E79F1D5332C03B92A9333",
      },
    };
    const paragraphs = (xml: string) => Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map((match) => match[0]);
    const effectiveParagraphLayout = (paragraph: string, stylesXml: string) => {
      const styleNodes = Array.from(stylesXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)).map((match) => match[0]);
      const direct = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "";
      const chain: string[] = [];
      let current = direct.match(/<w:pStyle\b[^>]*\bw:val="([^"]*)"/)?.[1];
      while (current) {
        const style = styleNodes.find((node) => node.match(/w:styleId="([^"]*)"/)?.[1] === current)!;
        expect(style, current).toBeTruthy();
        chain.unshift(style.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] || "");
        current = style.match(/<w:basedOn\b[^>]*\bw:val="([^"]*)"/)?.[1];
        if (chain.length > 20) throw new Error("Cyclic test style fixture");
      }
      const tabs = new Map<number, string>();
      const ind: Record<string, number> = {};
      for (const layer of [...chain, direct]) {
        for (const match of layer.matchAll(/<w:tab\b[^>]*\/>/g)) {
          const position = Number(match[0].match(/w:pos="(-?\d+)"/)![1]);
          const alignment = match[0].match(/w:val="([^"]*)"/)![1];
          if (alignment === "clear") tabs.delete(position);
          else tabs.set(position, alignment);
        }
        const indent = layer.match(/<w:ind\b[^>]*\/>/)?.[0] || "";
        for (const attribute of indent.matchAll(/w:(\w+)="(-?\d+)"/g)) ind[attribute[1]] = Number(attribute[2]);
      }
      return { tabs: [...tabs].sort(([a], [b]) => a - b), ind };
    };
    const exceptApprovedSignatureParagraphs = (xml: string) => xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
      const text = xmlText(paragraph);
      return /SIGNATORY|INSTRUCTOR|Подпись преподавателя|\(ФИО\)|\(подпись\)|\(дата\)/.test(text)
        || /^_+$/.test(text.trim()) ? "" : paragraph.replace(/<w:spacing w:before="2300"\/>/g, "");
    });

    it.each(Object.keys(specs) as Array<keyof typeof specs>)("%s: изменяет только согласованные абзацы и сохраняет шапку/исходник", async (docType) => {
      const spec = specs[docType];
      const { documentXml, manifest, template, zip } = await loadGroupTemplate(docType);
      const source = fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename));
      expect(sha256(source)).toBe(spec.sourceHash);
      expect(manifest.template_version).toBe(spec.version);
      expect(manifest.qa?.status).toBe("pending_actual_word_visual_review");
      expect(manifest.qa?.renderer).toBeUndefined();
      expect(sha256(Buffer.from(exceptApprovedSignatureParagraphs(documentXml)))).toBe(spec.unchangedHash);
      const sourceZip = await JSZip.loadAsync(source);
      for (const part of Object.keys(sourceZip.files).filter((name) => !name.endsWith("/") && name !== "word/document.xml")) {
        expect(await zipPart(zip, part), part).toEqual(await zipPart(sourceZip, part));
      }
      const sourceXml = await sourceZip.file("word/document.xml")!.async("string");
      expect(documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(sourceXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
      const entry = GROUP_DOCUMENT_TEMPLATE_BUNDLE[docType];
      expect(Buffer.from(entry.templateBase64, "base64")).toEqual(template);
      expect(JSON.parse(entry.manifestJson)).toEqual(manifest);
      if (docType === "expulsion_order") {
        const heading = paragraphs(documentXml).find((p) => xmlText(p).includes("3. Отчислить без выдачи"))!;
        expect(heading).toContain("<w:keepNext/>");
        expect(heading).not.toContain('w:before="2300"');
        expect(paragraphs(documentXml).filter((p) => xmlText(p).includes("(дата)"))).toHaveLength(2);
      } else {
        expect(sha256(Buffer.from(documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0])))
          .toBe("F79BD082550B380004E55F1FBEB9D95FDC34B16D364E1182C468CBCEE2D56360");
        expect(documentXml).toContain("[[INSTRUCTOR_1_SHORT]]");
        expect(documentXml).toContain("[[INSTRUCTOR_2_SHORT]]");
      }
      const labels = paragraphs(documentXml).filter((p) => xmlText(p).includes("(ФИО)"));
      expect(labels).toHaveLength(spec.pairs);
      for (const label of labels) {
        expect(xmlText(label)).toBe("(подпись)(ФИО)");
        expect(label.match(/<w:tab\/>/g)).toHaveLength(2);
        expect(label).toContain('<w:ind w:left="0" w:right="0" w:firstLine="0" w:hanging="0"');
        for (const stop of spec.stops) {
          expect(stop).toBeLessThan(spec.width);
          expect(label).toContain(`<w:tab w:val="center" w:pos="${stop}"/>`);
        }
      }
    });

    it.each(Object.keys(specs) as Array<keyof typeof specs>)("%s: итоговые табуляторы учитывают реальную цепочку стилей, а не только direct pPr", async (docType) => {
      const { documentXml, zip, manifest } = await loadGroupTemplate(docType);
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      const sourceZip = await JSZip.loadAsync(fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename)));
      const sourceXml = await sourceZip.file("word/document.xml")!.async("string");
      expect(await sourceZip.file("word/styles.xml")!.async("string")).toBe(stylesXml);
      const sourceLabel = paragraphs(sourceXml).find((paragraph) => xmlText(paragraph).includes("(ФИО)"))!;
      const sourceLayout = effectiveParagraphLayout(sourceLabel, stylesXml);
      const newParagraphs = paragraphs(documentXml).filter((paragraph) => paragraph.includes("<w:tabs>")
        && /SIGNATORY|INSTRUCTOR|\(ФИО\)|\(дата\)|^_+$/.test(xmlText(paragraph).trim()));
      expect(newParagraphs.length).toBeGreaterThanOrEqual(6);
      const nameLines = newParagraphs.filter((paragraph) => /SIGNATORY_SHORT|INSTRUCTOR_\d_SHORT/.test(paragraph));
      expect(nameLines).toHaveLength(specs[docType].pairs);
      for (const paragraph of newParagraphs) {
        const actual = effectiveParagraphLayout(paragraph, stylesXml);
        expect(actual.tabs).toEqual(specs[docType].stops.map((stop) => [stop, "center"]));
        if (nameLines.includes(paragraph)) {
          const origin = specs[docType].stops[1];
          expect(actual.ind).toEqual({ left: origin, right: 0, hanging: origin,
            leftChars: 0, rightChars: 0, hangingChars: 0 });
          expect(actual.ind.left - actual.ind.hanging).toBe(0);
          expect(paragraph).not.toMatch(/\bw:firstLine(?:Chars)?=/);
          expect(paragraph).toContain("<w:keepNext/>");
        } else {
          expect(actual.ind).toEqual({ left: 0, right: 0, firstLine: 0, hanging: 0,
            leftChars: 0, rightChars: 0, firstLineChars: 0, hangingChars: 0 });
        }
      }
      if (docType === "attestation_sheet") {
        expect(sourceLayout.tabs).toEqual(Array.from({ length: 16 }, (_, index) => [(index + 1) * 916, "left"]));
        expect(sourceLayout.ind.left).toBe(-993);
        const newLabel = newParagraphs.find((paragraph) => xmlText(paragraph).includes("(ФИО)"))!;
        const withoutClears = newLabel.replace(/<w:tab w:val="clear"[^>]*\/>/g, "");
        // Regression proof: adding two direct stops alone leaves HTML's earlier
        // stops active, making labels and captioned lines use different columns.
        expect(effectiveParagraphLayout(withoutClears, stylesXml).tabs[0]).toEqual([916, "left"]);
        expect(effectiveParagraphLayout(withoutClears, stylesXml).tabs).toHaveLength(18);
      } else {
        expect(sourceLayout.tabs).toEqual([]);
      }
    });

    it.each(["empty", "typical", "long", "long-shortname"])("сохраняет %s подписи и tab-пары при реальной подстановке DOCX", async (mode) => {
      const name = mode === "empty" ? "" : mode === "typical" ? "Тестов Т. Т." : mode === "long-shortname"
        ? shortNameRu("Синтетический-Длиннофамильный Тестовый Проверочный")
        : "Синтетический-Длиннофамильный Тестовый Проверочный Подписант";
      if (mode === "long-shortname") expect(name).toBe("Синтетический-Длиннофамильный Т.П.");
      const position = mode === "empty" ? "" : mode === "typical" ? "Руководитель учебного центра" : "Исполняющий обязанности руководителя учебного центра по дополнительному профессиональному образованию";
      for (const docType of Object.keys(specs) as Array<keyof typeof specs>) {
        const { documentXml, manifest, zip } = await loadGroupTemplate(docType);
        const compiled = compileGroupDocumentXml({ documentXml, manifest, snapshot: {
          scalars: scalarValuesFor(documentXml, { SIGNATORY_POSITION: position, SIGNATORY_SHORT: name,
            ORG_SHORT_NAME: mode === "long" ? "Синтетическая организация с длинным наименованием — ТОЛЬКО ТЕСТ" : "",
            INSTRUCTOR_1_SHORT: name, INSTRUCTOR_2_SHORT: name }), rows: [], rowsBySource: emptyRepeaterSources(manifest),
        } });
        expect(findUnresolvedTokens(compiled)).toEqual([]);
        if (name) expect(xmlText(compiled)).toContain(name);
        if (position) {
          const caption = paragraphs(compiled).find((p) => xmlText(p).includes(position))!;
          expect(caption).not.toContain("<w:tab/>");
          expect(xmlText(caption)).not.toContain("____");
          expect(caption).toContain("<w:keepNext/>");
        }
        const labels = paragraphs(compiled).filter((p) => xmlText(p).includes("(ФИО)"));
        expect(labels).toHaveLength(specs[docType].pairs);
        for (const label of labels) expect(xmlText(label)).not.toMatch(/ {2,}/);
        const allParagraphs = paragraphs(compiled);
        for (const label of labels) {
          const signature = allParagraphs[allParagraphs.indexOf(label) - 1];
          expect(signature).toContain("<w:keepNext/>");
          expect(signature.match(/<w:tab\/>/g)).toHaveLength(2);
          expect(xmlText(signature)).toContain("_".repeat(docType === "expulsion_order" ? 32 : 26));
          expect(signature.match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0])
            .toBe(label.match(/<w:tabs>[\s\S]*?<\/w:tabs>/)?.[0]);
          const ind = signature.match(/<w:ind\b[^>]*\/>/)![0];
          expect(ind).toContain(`w:left="${specs[docType].stops[1]}"`);
          expect(ind).toContain(`w:hanging="${specs[docType].stops[1]}"`);
          expect(ind).not.toMatch(/\bw:firstLine(?:Chars)?=/);
        }
        expect(compiled.match(/<w:tbl\b/g)?.length).toBe(docType === "expulsion_order" ? 2 : 1);
        zip.file("word/document.xml", compiled);
        const generated = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
        expect(await generated.file("word/document.xml")!.async("string")).toBe(compiled);
      }
      // Layout structure is proven here; actual Word pagination remains pending.
    });
  });

  it("не вшивает должность подписанта и допускает явно пустую подпись", async () => {
    for (const docType of [
      "enrollment_order",
      "expulsion_order",
      "student_list",
      "schedule",
      "attestation_sheet",
      "pass",
    ]) {
      const { manifest, documentXml } = await loadGroupTemplate(docType);
      expect(documentXml, docType).toContain("[[SIGNATORY_POSITION]]");
      expect(documentXml, docType).toContain("[[SIGNATORY_SHORT]]");
      expect(xmlText(documentXml), docType).not.toContain("Генеральный директор");
      const rows = manifest.row_tokens.length
        ? [Object.fromEntries(manifest.row_tokens.map((token) => [token, token === "N" ? "1" : ""]))]
        : [];
      const scalarSnapshot = scalarValuesFor(documentXml, {
        SIGNATORY_POSITION: "",
        SIGNATORY_SHORT: "",
      });
      expect(Object.values(scalarSnapshot), docType).not.toContain("Генеральный директор");
      const compiled = compileGroupDocumentXml({
        documentXml,
        manifest,
        snapshot: {
          scalars: scalarSnapshot,
          rows,
          rowsBySource: emptyRepeaterSources(manifest),
        },
      });
      expect(findUnresolvedTokens(compiled), docType).toEqual([]);
      expect(xmlText(compiled), docType).not.toContain("Генеральный директор");
    }
  });

  it("даёт расписанию и ведомости отдельное место подписи каждого преподавателя", async () => {
    for (const docType of ["schedule", "attestation_sheet"]) {
      const { manifest, documentXml } = await loadGroupTemplate(docType);
      expect(documentXml, docType).toContain("[[INSTRUCTOR_1_SHORT]]");
      expect(documentXml, docType).toContain("[[INSTRUCTOR_2_SHORT]]");
      const rows = manifest.row_tokens.length
        ? [Object.fromEntries(manifest.row_tokens.map((token) => [token, token === "N" ? "1" : ""]))]
        : [];
      const compiled = compileGroupDocumentXml({
        documentXml,
        manifest,
        snapshot: {
          scalars: scalarValuesFor(documentXml, {
            INSTRUCTOR_1_SHORT: "Иванов И.И.",
            INSTRUCTOR_2_SHORT: "Петров П.П.",
          }),
          rows,
        },
      });
      const instructorParagraphs = splitTopLevel(compiled, ["w:p"])
        .map((paragraph) => xmlText(paragraph.xml))
        .filter((text) => /преподавател/i.test(text) && /Иванов|Петров/.test(text));
      expect(instructorParagraphs.some((text) => text.includes("Иванов И.И.")), docType).toBe(true);
      expect(instructorParagraphs.some((text) => text.includes("Петров П.П.")), docType).toBe(true);
      expect(
        instructorParagraphs.some((text) => text.includes("Иванов И.И.") && text.includes("Петров П.П.")),
        `${docType}: signatures must be separate`,
      ).toBe(false);

      const withoutSecond = compileGroupDocumentXml({
        documentXml,
        manifest,
        snapshot: {
          scalars: scalarValuesFor(documentXml, {
            INSTRUCTOR_1_SHORT: "Иванов И.И.",
            INSTRUCTOR_2_SHORT: "",
          }),
          rows,
        },
      });
      expect(findUnresolvedTokens(withoutSecond), docType).toEqual([]);
      expect(xmlText(withoutSecond), docType).not.toContain("Петров П.П.");
      expect(xmlText(withoutSecond), docType).toMatch(/преподавател(?:ь|я) 2/iu);
    }
  });

  it("компилирует все восемь шаблонов из реальных данных генератора", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));

    for (const filename of manifestFiles) {
      const docType = filename.replace(/\.json$/, "") as DocType;
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const generated = generateDocument(structuredClone(SAMPLE_CONTEXT), docType, {
        mode: "blank",
      });
      const rowHtml = manifest.row_source_key
        ? generated.variables[manifest.row_source_key]
        : "";
      const rows = parseGeneratedHtmlRows(rowHtml, manifest.row_tokens);
      const template = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      const zip = await JSZip.loadAsync(template);
      const xml = await zip.file("word/document.xml")!.async("string");

      const scalars = buildGroupDocumentScalars(generated.variables);
      Object.assign(scalars, {
        SIGNATORY_POSITION: SAMPLE_CONTEXT.organization.director_position,
        SIGNATORY_SHORT: "Дроздов Д.В.",
        INSTRUCTOR_1_SHORT: "",
        INSTRUCTOR_2_SHORT: "",
      });
      const compiled = compileGroupDocumentXml({
        documentXml: xml,
        manifest,
        snapshot: {
          scalars,
          rows,
          rowsBySource: emptyRepeaterSources(manifest),
        },
      });

      expect(findUnresolvedTokens(compiled), manifest.template_id).toEqual([]);
      if (manifest.row_tokens.length > 0) {
        expect(rows.length, `${manifest.template_id}: rows`).toBeGreaterThan(0);
      }
      expect(compiled, manifest.template_id).toContain(SAMPLE_CONTEXT.group.program_title);

      const headerParts = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
      const headerXml = await Promise.all(
        headerParts.map((name) => zip.file(name)!.async("string")),
      );
      const mediaParts = Object.keys(zip.files).filter((name) => /^word\/media\/image\d+\./.test(name));
      const mediaBytes = await Promise.all(mediaParts.map((name) => zipPart(zip, name)));
      expect(
        headerXml.some((xml) => xml.includes("<w:drawing")),
        `${manifest.template_id}: exact client header`,
      ).toBe(true);
      expect(
        mediaBytes.some((bytes) => (bytes?.byteLength || 0) > 1000),
        `${manifest.template_id}: header image`,
      ).toBe(true);
    }
  });

  it("сохраняет неизменяемые части клиентских DOCX байт-в-байт", async () => {
    const manifestFiles = fs.readdirSync(path.join(ROOT, "manifests"));

    for (const filename of manifestFiles) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "manifests", filename), "utf8"),
      ) as GroupDocumentManifest;
      const sourceBytes = fs.readFileSync(path.join(SOURCE_ROOT, manifest.source_filename));
      const templateBytes = fs.readFileSync(
        path.join(ROOT, "templates", filename.replace(/\.json$/, ".docx")),
      );
      expect(sha256(sourceBytes), `${manifest.template_id}: source hash`).toBe(
        manifest.source_sha256,
      );
      expect(sha256(templateBytes), `${manifest.template_id}: template hash`).toBe(
        manifest.template_sha256,
      );

      const sourceZip = await JSZip.loadAsync(sourceBytes);
      const templateZip = await JSZip.loadAsync(templateBytes);
      const allowed = new Set(manifest.qa?.preserve_package_parts_except || []);
      const sourceParts = Object.keys(sourceZip.files).filter((name) => !name.endsWith("/"));
      const templateParts = Object.keys(templateZip.files).filter((name) => !name.endsWith("/"));
      const allParts = new Set([...sourceParts, ...templateParts]);
      for (const partName of allParts) {
        if (allowed.has(partName)) continue;
        const sourcePart = await zipPart(sourceZip, partName);
        const templatePart = await zipPart(templateZip, partName);
        expect(templatePart, `${manifest.template_id}: missing ${partName}`).not.toBeNull();
        expect(sourcePart, `${manifest.template_id}: unexpected ${partName}`).not.toBeNull();
        expect(sha256(templatePart!), `${manifest.template_id}: changed ${partName}`).toBe(
          sha256(sourcePart!),
        );
      }

      const documentXml = await templateZip.file("word/document.xml")!.async("string");
      const pageSize = documentXml.match(/<w:pgSz\b[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"[^>]*>/);
      expect(pageSize, `${manifest.template_id}: page size`).not.toBeNull();
      const width = Number(pageSize![1]);
      const height = Number(pageSize![2]);
      expect(
        width > height ? "landscape" : "portrait",
        `${manifest.template_id}: orientation`,
      ).toBe(manifest.orientation);
    }
  });

  it("добавляет книге регистрации точную фирменную шапку из клиентского альбомного приказа", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "manifests", "registration_book.json"), "utf8"),
    ) as GroupDocumentManifest;
    const headerSourceBytes = fs.readFileSync(
      path.join(SOURCE_ROOT, manifest.header_source_filename!),
    );
    expect(sha256(headerSourceBytes)).toBe(manifest.header_source_sha256);

    const headerSourceZip = await JSZip.loadAsync(headerSourceBytes);
    const templateZip = await JSZip.loadAsync(
      fs.readFileSync(path.join(ROOT, "templates", "registration_book.docx")),
    );
    expect(await zipPart(templateZip, "word/header1.xml")).not.toBeNull();
    expect(sha256((await zipPart(templateZip, "word/_rels/header1.xml.rels"))!)).toBe(
      sha256((await zipPart(headerSourceZip, manifest.header_source_rels_part!))!),
    );
    expect(sha256((await zipPart(templateZip, "word/media/image1.jpeg"))!)).toBe(
      sha256((await zipPart(headerSourceZip, "word/media/image1.jpeg"))!),
    );

    const sourceHeaderXml = (await headerSourceZip.file(manifest.header_source_part!)!.async("string"));
    const templateHeaderXml = (await templateZip.file("word/header1.xml")!.async("string"));
    expect(sourceHeaderXml).toContain("<w:drawing");
    expect(templateHeaderXml).toContain("<w:drawing");
    expect(templateHeaderXml).not.toBe(sourceHeaderXml);
  });

  it("сохраняет разнесение даты и номера в ведомости итоговой аттестации", async () => {
    const templateZip = await JSZip.loadAsync(
      fs.readFileSync(path.join(ROOT, "templates", "attestation_sheet.docx")),
    );
    const documentXml = await templateZip.file("word/document.xml")!.async("string");
    const line = Array.from(documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
      .map((match) => match[0])
      .find((paragraph) => paragraph.includes("[[END_DATE]]"));
    expect(line).toBeTruthy();
    const text = (line!.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((node) => node.replace(/<[^>]+>/g, ""))
      .join("");
    expect(text).toMatch(/Дата \[\[END_DATE\]\]\s{10,}N \[\[GROUP_NUMBER\]\]\/ИА/);
  });
});
