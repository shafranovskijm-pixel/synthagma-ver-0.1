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
  resolveDocumentSignatory,
  validateGroupDocumentPrerequisites,
  type GoreltechCompiledDocumentType,
  type GroupDocumentManifest,
} from "../groupDocument";
import { findUnresolvedTokens, splitTopLevel } from "../xml";
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

describe("групповые DOCX Beta", () => {
  it("превращает HTML-строки только в чистые ячейки", () => {
    const rows = parseGeneratedHtmlRows(
      '<tr><td>1</td><td><b>Иванов &amp; Петров</b></td><td></td></tr>',
      ["N", "NAME", "BASIS"],
    );
    expect(rows).toEqual([{ N: "1", NAME: "Иванов & Петров", BASIS: "" }]);
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
    })).toEqual({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      fillMode: "data",
      docStatus: "draft",
      documentNumber: "УЦ-999/2026",
    })).toEqual({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      fillMode: "data",
      docStatus: "final",
      documentNumber: " УЦ-5/2026 ",
    })).toEqual({ docStatus: "final", documentNumber: "УЦ-5/2026" });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: null,
      documentDate: "2026-08-24",
    })).toEqual({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "expulsion_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: null,
    })).toEqual({ docStatus: "draft", documentNumber: null });
    expect(canonicalizeLegacyDocumentMetadata({
      docType: "enrollment_order",
      fillMode: "data",
      docStatus: "final",
      documentNumber: "УЦ-5/2026",
      documentDate: "2026-08-24",
    })).toEqual({ docStatus: "final", documentNumber: "УЦ-5/2026" });
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
        snapshot: { scalars, rows },
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
      expect(manifest.repeater?.minimum_rows, docType).toBe(minimumRows);
      const actualRow = Object.fromEntries(manifest.row_tokens.map((token) => [token, ""]));
      actualRow.N = "1";
      actualRow.STUDENT_NAME = "Фактический Слушатель";
      const compiled = compileGroupDocumentXml({
        documentXml,
        manifest,
        snapshot: {
          scalars: scalarValuesFor(documentXml),
          rows: [actualRow],
        },
      });
      const table = splitTopLevel(compiled, ["w:tbl"])[manifest.repeater!.table_index];
      const rows = splitTopLevel(table.xml, ["w:tr"]);
      expect(rows, docType).toHaveLength(manifest.repeater!.header_rows + minimumRows);
      expect(xmlText(rows[manifest.repeater!.header_rows].xml), docType).toContain(
        "Фактический Слушатель",
      );
      for (let index = 1; index < minimumRows; index += 1) {
        const reserve = xmlText(rows[manifest.repeater!.header_rows + index].xml);
        expect(reserve, `${docType}: reserve row ${index + 1}`).not.toContain(
          "Фактический Слушатель",
        );
        expect(reserve, `${docType}: reserve row ${index + 1}`).not.toContain("V");
        const firstCell = splitTopLevel(
          rows[manifest.repeater!.header_rows + index].xml,
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
